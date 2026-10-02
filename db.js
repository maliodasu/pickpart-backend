import { createPool } from 'mysql2';
import 'dotenv/config';

const pool = createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err.message);
        process.exit(1);
    }
    console.log('Successfully connected to MySQL database.');
    connection.release();
});

export default pool.promise();
