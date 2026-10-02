import express, { json } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'dotenv/config';
import db from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import modelRoutes from './routes/modelRoutes.js';
import rackRoutes from './routes/rackRoutes.js';
import workOrderRoutes from './routes/workOrderRoutes.js';
import pickingSessionRoutes from './routes/pickingSessionRoutes.js';
import pickingSequenceRoutes from './routes/pickingSequenceRoutes.js';
import rfidRoutes from './routes/rfidRoutes.js';
import statsRoutes from './routes/statsRoutes.js';

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const localIp = getLocalIp();
const serverStartTime = Date.now();
const app = express();
const server = createServer(app);
export const wss = new WebSocketServer({ server });

let activeScanSession = {
  active: false,
  part_no: ""
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGE_DIR = path.join(__dirname, 'public', 'uploads', 'parts');

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  credentials: true
}));

app.use(json());
app.use(morgan('dev'));
app.use((req, res, next) => {
  console.log(`Query:`, req.query);
  console.log(`Body:`, req.body);
  next();
});

app.use('/api/models', modelRoutes);
app.use('/api/parts', rackRoutes);
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/picking-sessions', pickingSessionRoutes);
app.use('/api/picking-sequences', pickingSequenceRoutes);
app.use('/api/rfid', rfidRoutes);
app.use('/api/stats', statsRoutes);

const clients = new Set();

wss.on('connection', (ws, req) => {
  console.log('[WS] Klien baru terhubung dari IP:', req.socket.remoteAddress);
  clients.add(ws);

  // Kirim status sesi aktif saat ESP32/Frontend pertama kali terhubung
  ws.send(JSON.stringify({
    type: "session_status",
    active: activeScanSession.active,
    part_no: activeScanSession.part_no
  }));

  // Menerima pesan dari ESP32 atau Frontend
  ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log('[WS] Pesan diterima:', data);

        if (data.type === 'scan_tag' || data.type === 'modal_scan_tag') {
          // Broadcast tag yang ditangkap ESP32 ke SEMUA client (termasuk Frontend HP)
          const payload = JSON.stringify(data);
          for (const client of clients) {
            if (client.readyState === 1) { // WebSocket.OPEN
              client.send(payload);
            }
          }
        }
        else if (data.type === 'session_status') {
          // Update state sesi aktif berdasarkan pesan dari Frontend HP
          activeScanSession.active = data.active;
          activeScanSession.part_no = data.part_no || "";

          // Broadcast perubahan status sesi ke ESP32 agar ESP32 tahu state terbaru
          const payload = JSON.stringify({
            type: "session_status",
            active: activeScanSession.active,
            part_no: activeScanSession.part_no
          });

          for (const client of clients) {
            if (client.readyState === 1) {
              client.send(payload);
            }
          }
        }
      } catch (error) {
        console.error('[WS] Gagal memparsing JSON:', error);
      }
    });

  ws.on('close', () => {
    console.log('[WS] Klien terputus');
    clients.delete(ws);
  });
});

// Contoh Endpoint HTTP Express (opsional, misal untuk Frontend mengubah status sesi scan modal)
app.post('/api/set-scan-session', (req, res) => {
  const { active, part_no } = req.body;

  activeScanSession.active = active || false;
  activeScanSession.part_no = part_no || "";

  // Broadcast perubahan status sesi ke SEMUA client WebSocket (termasuk ESP32) secara real-time
  const payload = JSON.stringify({
    type: "session_status",
    active: activeScanSession.active,
    part_no: activeScanSession.part_no
  });

  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(payload);
    }
  }

  res.json({ success: true, activeScanSession });
});

// ==========================================
// A. ENDPOINT TAMBAHAN UNTUK TABLET / PICKING SESSION
// ==========================================

// 1. Mendapatkan daftar operator dari tabel operators
app.get('/api/operators', async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT DISTINCT operator_group FROM operators ORDER BY operator_group"
    );
    const operators = rows.length > 0 ? rows.map(r => r.operator_group) : ['A', 'B', 'C'];
    res.json(operators);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Mendapatkan snapshot sesi aktif saat ini untuk operator
app.get('/api/session/current', async (req, res) => {
  const operator = req.query.operator;
  if (!operator) {
    return res.status(400).json({ error: "parameter 'operator' wajib" });
  }

  try {
    const [sessions] = await db.execute(
      `SELECT ps.*, wo.sequence, wo.model_code AS model, wo.colour AS warna, wo.frame_no AS vin
       FROM picking_session ps
       JOIN work_orders wo ON ps.sequence = wo.sequence
       WHERE ps.operator = ? AND ps.status IN ('PENDING', 'IN_PROGRESS')
       ORDER BY ps.id DESC LIMIT 1`,
      [operator]
    );

    if (sessions.length === 0) {
      return res.json({ active: false });
    }

    const session = sessions[0];

    const [items] = await db.execute(
      `SELECT psi.id, psi.session_id, psi.part_no, psi.status, psi.scanned_at,
              srt.part_name, srt.old_address, srt.new_address
       FROM picking_session_items psi
       JOIN sps_rack_trimming srt ON psi.part_no = srt.part_no
       WHERE psi.session_id = ?`,
      [session.id]
    );

    const total = items.length;
    const done = items.filter(i => i.status === 'COMPLETED').length;
    const current_item = items.find(i => i.status === 'PENDING') || null;

    res.json({
      active: true,
      session: {
        id: session.id,
        sequence: session.sequence,
        model: session.model,
        warna: session.warna,
        vin: session.vin,
        status: session.status
      },
      total,
      done,
      current_item,
      items
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Endpoint Scan RFID dari Tablet / Simulator
app.post('/api/scan', async (req, res) => {
  const { operator, rfid_uid, device_id } = req.body;
  if (!operator || !rfid_uid) {
    return res.status(400).json({ error: "Operator dan rfid_uid wajib diisi" });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO smart_glove_logs (device_id, tag_id) VALUES (?, ?)`,
      [device_id || 'tablet_sim', rfid_uid]
    );

    const [parts] = await connection.execute(
      `SELECT part_no FROM sps_rack_trimming WHERE tag_id = ?`,
      [rfid_uid]
    );

    if (parts.length === 0) {
      await connection.rollback();
      return res.json({ result: 'alarm', message: 'Tag RFID tidak dikenali dalam sistem' });
    }

    const scannedPartNo = parts[0].part_no;

    const [sessions] = await connection.execute(
      `SELECT id FROM picking_session WHERE operator = ? AND status IN ('PENDING', 'IN_PROGRESS') ORDER BY id DESC LIMIT 1`,
      [operator]
    );

    if (sessions.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Tidak ada sesi picking aktif untuk operator ini" });
    }

    const sessionId = sessions[0].id;

    const [targetItems] = await connection.execute(
      `SELECT id, status FROM picking_session_items WHERE session_id = ? AND part_no = ?`,
      [sessionId, scannedPartNo]
    );

    if (targetItems.length === 0 || targetItems[0].status === 'COMPLETED') {
      await connection.rollback();
      return res.json({ result: 'alarm', message: 'Part tidak sesuai dengan urutan atau sudah diambil' });
    }

    await connection.execute(
      `UPDATE picking_session_items SET status = 'COMPLETED', scanned_at = NOW() WHERE session_id = ? AND part_no = ?`,
      [sessionId, scannedPartNo]
    );

    const [pendingItems] = await connection.execute(
      `SELECT COUNT(*) AS cnt FROM picking_session_items WHERE session_id = ? AND status = 'PENDING'`,
      [sessionId]
    );

    let sessionComplete = false;
    if (pendingItems[0].cnt === 0) {
      await connection.execute(
        `UPDATE picking_session SET status = 'COMPLETED' WHERE id = ?`,
        [sessionId]
      );
      sessionComplete = true;
    } else {
      await connection.execute(
        `UPDATE picking_session SET status = 'IN_PROGRESS' WHERE id = ?`,
        [sessionId]
      );
    }

    await connection.commit();
    res.json({ result: 'ok', session_complete: sessionComplete });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// 4. Endpoint Next Sequence (Auto / Manual)
app.post('/api/session/next', async (req, res) => {
  const { operator, mode, sequence, force } = req.body;
  if (!operator) return res.status(400).json({ error: "Operator wajib diisi" });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [activeSessions] = await connection.execute(
      `SELECT id, sequence, status FROM picking_session WHERE operator = ? AND status IN ('PENDING', 'IN_PROGRESS')`,
      [operator]
    );

    if (activeSessions.length > 0 && !force) {
      const active = activeSessions[0];
      const [pendingCount] = await connection.execute(
        `SELECT COUNT(*) AS cnt FROM picking_session_items WHERE session_id = ? AND status = 'PENDING'`,
        [active.id]
      );
      if (pendingCount[0].cnt > 0) {
        await connection.rollback();
        return res.status(400).json({ error: `Sequence ${active.sequence} belum selesai diambil.` });
      } else {
        await connection.execute(`UPDATE picking_session SET status = 'COMPLETED' WHERE id = ?`, [active.id]);
      }
    } else if (activeSessions.length > 0 && force) {
      await connection.execute(`UPDATE picking_session SET status = 'CANCELLED' WHERE id = ?`, [activeSessions[0].id]);
    }

    let targetSequence = sequence;

    if (mode === 'auto' || !targetSequence) {
      const [nextWo] = await connection.execute(
        `SELECT sequence FROM work_orders
         WHERE sequence NOT IN (SELECT sequence FROM picking_session WHERE status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED'))
         ORDER BY sequence ASC LIMIT 1`
      );
      if (nextWo.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: "Tidak ada Work Order / Sequence baru yang tersedia" });
      }
      targetSequence = nextWo[0].sequence;
    }

    const [woRows] = await connection.execute(
      `SELECT model_suffix FROM work_orders WHERE sequence = ?`,
      [targetSequence]
    );
    if (woRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: `Sequence ${targetSequence} tidak ditemukan di Work Orders` });
    }

    const modelSuffix = woRows[0].model_suffix;

    const [newSessionRes] = await connection.execute(
      `INSERT INTO picking_session (sequence, operator, status) VALUES (?, ?, 'IN_PROGRESS')`,
      [targetSequence, operator]
    );
    const newSessionId = newSessionRes.insertId;

    const [seqParts] = await connection.execute(
      `SELECT part_no FROM picking_sequence WHERE model_suffix = ?`,
      [modelSuffix]
    );

    for (const p of seqParts) {
      await connection.execute(
        `INSERT IGNORE INTO picking_session_items (session_id, part_no, status) VALUES (?, ?, 'PENDING')`,
        [newSessionId, p.part_no]
      );
    }

    await connection.commit();
    res.json({ status: 'ok', session_id: newSessionId, sequence: targetSequence });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// 5. Menyajikan Gambar Part
app.get('/api/image/:part_no', (req, res) => {
  const partNo = req.params.part_no;
  const imgPath = path.join(IMAGE_DIR, `${partNo}.jpg`);
  if (fs.existsSync(imgPath)) {
    res.sendFile(imgPath);
  } else {
    res.status(404).send('Gambar tidak ditemukan');
  }
});


// ==========================================
// B. SMART GLOVE & EXISTING API ROUTES
// ==========================================

app.post('/api/scan-rfid', async (req, res) => {
  const { device, tag_id, battery_volts, battery_pct } = req.body;

  if (!tag_id) {
    return res.status(400).json({ success: false, message: 'tag_id is required.' });
  }

  try {
    await db.execute(
      `INSERT INTO smart_glove_logs (device_id, tag_id, battery_volts, battery_pct) VALUES (?, ?, ?, ?)`,
      [device || 'smart_glove', tag_id, battery_volts || null, battery_pct || null]
    );

    const [parts] = await db.execute(
      `SELECT part_no, part_name, new_address, tag_id FROM sps_rack_trimming WHERE tag_id = ?`,
      [tag_id]
    );

    if (parts.length === 0) {
      console.log(`[RFID SCAN FAIL] Tag ID tidak dikenal: ${tag_id}`);
      return res.status(404).json({ success: false, message: 'RFID Tag tidak ditemukan di master rak.' });
    }

    const matchedPart = parts[0];

    const [activeSessions] = await db.execute(
      `SELECT id FROM picking_session WHERE status IN ('IN_PROGRESS', 'PENDING') ORDER BY id DESC LIMIT 1`
    );

    if (activeSessions.length === 0) {
      console.log(`[RFID SCAN OK] Part ditemukan tapi tidak ada sesi aktif: ${matchedPart.part_no}`);
      return res.json({ success: true, matchedPart, message: 'Tag valid & ditemukan (Tidak ada sesi aktif).' });
    }

    const sessionId = activeSessions[0].id;

    const [sessionItem] = await db.execute(
      `SELECT id, status FROM picking_session_items WHERE session_id = ? AND part_no = ?`,
      [sessionId, matchedPart.part_no]
    );

    if (sessionItem.length > 0) {
      if (sessionItem[0].status !== 'COMPLETED') {
        await db.execute(
          `UPDATE picking_session_items SET status = 'COMPLETED', scanned_at = NOW() WHERE id = ?`,
          [sessionItem[0].id]
        );
        console.log(`[SESSION ITEM COMPLETED] Session: ${sessionId} | Part: ${matchedPart.part_no}`);
      }
    }

    console.log(`[RFID SCAN OK] Part: ${matchedPart.part_no} (${matchedPart.part_name}) | Bat: ${battery_volts}V`);

    res.json({
      success: true,
      matchedPart,
      message: 'Tag valid & berhasil divalidasi!'
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// app.post('/api/sessions/validate-rfid', async (req, res) => {
//   const { sessionId, tagId, tag_id, battery_volts, battery_pct } = req.body;
//   const targetTag = tagId || tag_id;
//
//   if (!targetTag) {
//     return res.status(400).json({ success: false, message: 'tagId is required.' });
//   }
//
//   try {
//     const [parts] = await db.execute(
//       `SELECT part_no, part_name, new_address, tag_id FROM sps_rack_trimming WHERE tag_id = ?`,
//       [targetTag]
//     );
//
//     if (parts.length === 0) {
//       return res.status(404).json({ success: false, message: 'RFID Tag tidak ditemukan.' });
//     }
//
//     const matchedPart = parts[0];
//
//     if (sessionId) {
//       const [sessionItem] = await db.execute(
//         `SELECT id, status FROM picking_session_items WHERE session_id = ? AND part_no = ?`,
//         [sessionId, matchedPart.part_no]
//       );
//
//       if (sessionItem.length > 0 && sessionItem[0].status !== 'COMPLETED') {
//         await db.execute(
//           `UPDATE picking_session_items SET status = 'COMPLETED', scanned_at = NOW() WHERE id = ?`,
//           [sessionItem[0].id]
//         );
//       }
//     }
//
//     res.json({ success: true, matchedPart, message: 'Tag valid & ditemukan!' });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

app.get('/api/sessions/:sessionId/checklist', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const [items] = await db.execute(
      `SELECT psi.id, psi.part_no, s.part_name, s.tag_id, s.new_address, psi.status
       FROM picking_session_items psi
       JOIN sps_rack_trimming s ON psi.part_no = s.part_no
       WHERE psi.session_id = ?`,
      [sessionId]
    );
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/picking-sessions/initiate', async (req, res) => {
    try {
        const { operator } = req.body;
        const opName = operator || 'Operator_01';

        const [woRows] = await db.query(`SELECT * FROM work_orders where delivery_date = CURDATE()`);
        if (woRows.length === 0) return res.status(404).json({ success: false, message: "Tidak ada work order." });

        const targetSequence = woRows[0].sequence;
        const modelSuffix = woRows[0].model_suffix;

        const [existing] = await db.query(`SELECT id FROM picking_session WHERE sequence = ?`, [targetSequence]);
        let sessionId;
        if (existing.length > 0) {
            sessionId = existing[0].id;
            await db.query(`UPDATE picking_session SET status = 'IN_PROGRESS' WHERE id = ?`, [sessionId]);
        } else {
            const [insertRes] = await db.query(`INSERT INTO picking_session (sequence, operator, status) VALUES (?, ?, 'IN_PROGRESS')`, [targetSequence, opName]);
            sessionId = insertRes.insertId;

            if (modelSuffix) {
                const [partsRows] = await db.query(`SELECT part_no FROM picking_sequence WHERE model_suffix = ?`, [modelSuffix]);
                for (const p of partsRows) {
                    await db.query(`INSERT IGNORE INTO picking_session_items (session_id, part_no, status) VALUES (?, ?, 'PENDING')`, [sessionId, p.part_no]);
                }
            }
        }

        const [sessionDetails] = await db.query(`SELECT ps.id, ps.sequence, ps.operator, ps.status, wo.model_suffix, wo.model_code FROM picking_session ps JOIN work_orders wo ON ps.sequence = wo.sequence WHERE ps.id = ?`, [sessionId]);
        const [partsList] = await db.query(`SELECT psi.id, psi.part_no, srt.part_name, srt.tag_id, srt.new_address, psi.status FROM picking_session_items psi JOIN sps_rack_trimming srt ON psi.part_no = srt.part_no WHERE psi.session_id = ?`, [sessionId]);

        res.status(201).json({ success: true, sessionId, session: sessionDetails[0], parts: partsList });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



app.get('/api/config/ip', (req, res) => {
    const ip = getLocalIp();
    res.json({ success: true, ip, serverUrl: `http://${ip}:3000` });
});

app.get('/api/status', (req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
    res.json({
        success: true,
        status: 'online',
        uptimeSeconds,
        serverStartTime
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://${localIp}:${PORT}`);
});

export default app;
