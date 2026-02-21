const crypto = require('crypto');

/**
 * Encryption utility for OAuth tokens
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment variable
 * @returns {Buffer} 256-bit encryption key
 */
function getEncryptionKey() {
    const keyHex = process.env.ENCRYPTION_KEY;

    if (!keyHex) {
        throw new Error('ENCRYPTION_KEY environment variable is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }

    const key = Buffer.from(keyHex, 'hex');

    if (key.length !== KEY_LENGTH) {
        throw new Error(`ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes). Current length: ${key.length} bytes`);
    }

    return key;
}

/**
 * Encrypt a string using AES-256-GCM
 * @param {string} plaintext - Text to encrypt
 * @returns {string} Encrypted text in format: iv:authTag:ciphertext (hex-encoded)
 */
function encrypt(plaintext) {
    if (!plaintext) {
        throw new Error('Cannot encrypt empty text');
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return format: iv:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with encrypt()
 * @param {string} encryptedText - Encrypted text in format: iv:authTag:ciphertext
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedText) {
    if (!encryptedText) {
        throw new Error('Cannot decrypt empty text');
    }

    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted text format. Expected format: iv:authTag:ciphertext');
    }

    const [ivHex, authTagHex, encrypted] = parts;

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Generate a new random encryption key (for setup only)
 * @returns {string} Hex-encoded 256-bit key
 */
function generateKey() {
    return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Verify that encryption/decryption is working correctly
 * @returns {boolean} True if crypto is functional
 */
function verifyCrypto() {
    try {
        const testText = 'test-encryption-' + Date.now();
        const encrypted = encrypt(testText);
        const decrypted = decrypt(encrypted);
        return decrypted === testText;
    } catch (error) {
        console.error('Crypto verification failed:', error.message);
        return false;
    }
}

module.exports = {
    encrypt,
    decrypt,
    generateKey,
    verifyCrypto
};
