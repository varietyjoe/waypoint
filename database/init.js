const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'waypoint.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Initialize the database with the schema
 */
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        // Create a new database connection
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                reject(err);
                return;
            }
            console.log('Connected to the SQLite database.');
        });

        // Read the schema file
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');

        // Execute the schema
        db.exec(schema, (err) => {
            if (err) {
                console.error('Error executing schema:', err.message);
                db.close();
                reject(err);
                return;
            }
            console.log('Database schema initialized successfully.');

            db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                    reject(err);
                    return;
                }
                console.log('Database connection closed.');
                resolve();
            });
        });
    });
}

// Run initialization if this file is executed directly
if (require.main === module) {
    initializeDatabase()
        .then(() => {
            console.log('Database initialization complete!');
            process.exit(0);
        })
        .catch((err) => {
            console.error('Database initialization failed:', err);
            process.exit(1);
        });
}

module.exports = { initializeDatabase, DB_PATH };
