const path = require('path');
const dotenv = require('dotenv');

function loadEnv() {
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'production') {
        return;
    }

    dotenv.config({
        path: path.join(__dirname, '../../.env'),
        override: false,
    });
}

module.exports = { loadEnv };
