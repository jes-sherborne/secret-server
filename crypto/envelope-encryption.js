const authenticatedEncryption = require("./authenticated-encryption");
const cryptoUtil = require("./crypto-util");

const HEADER_LENGTH = 8;

const ENCRYPTED_KEY_LENGTH_OFFSET = 0;
const ENCRYPTED_BLOB_LENGTH_OFFSET = 4;

function encrypt(keyId, keySpec, keyService, rawData, aad, embedAad, callback) {
  var aadBuffer;
  
  if (!cryptoUtil.ALGORITHMS.hasOwnProperty(keySpec)) {
    callback(new Error("Unsupported keySpec"));
    return;
  }
  
  try {
    aadBuffer = cryptoUtil.encodeAadBuffer(aad);
  } catch(e) {
    callback(e);
    return;
  }
  
  keyService.generateDataKey(keyId, cryptoUtil.ALGORITHMS[keySpec].keyLength, function(err, key, encryptedKey) {
    if (err) {
      callback(err);
      return;
    }
    authenticatedEncryption.encrypt(rawData, keyId, key, keySpec, aadBuffer, embedAad, function(err, encryptedBlob) {
      var header;
      
      if (err) {
        callback(err);
        return;
      }
      
      header = Buffer.alloc(HEADER_LENGTH);
      header.writeInt32LE(encryptedKey.length, ENCRYPTED_KEY_LENGTH_OFFSET);
      header.writeInt32LE(encryptedBlob.length, ENCRYPTED_BLOB_LENGTH_OFFSET);
      
      callback(null, Buffer.concat([header, encryptedKey, encryptedBlob]));
    });
  });
}

function decrypt(keyService, envelope, aad, callback) {
  var aadBuffer, parsedEnvelope;
  
  try {
    parsedEnvelope = parseEnvelope(envelope);
    aadBuffer = aad ? cryptoUtil.encodeAadBuffer(aad) : null;
  } catch (e) {
    callback(e);
    return;
  }

  keyService.decrypt(parsedEnvelope.encryptedKey, function(err, decryptedKey) {
    if (err) {
      callback(err);
      return;
    }
  
    authenticatedEncryption.decrypt(parsedEnvelope.encryptedBlob, decryptedKey, aadBuffer, function(err, decryptedData, aad) {
      var parsedAad;
      
      if (err) {
        callback(err);
        return;
      }
  
      try {
        parsedAad = cryptoUtil.decodeAadBuffer(aad);
      } catch (e) {
        callback(e);
        return;
      }
  
      callback(null, decryptedData, parsedAad);
  
    });
  });
}

function extractAad(envelope) {
  return cryptoUtil.decodeAadBuffer(authenticatedEncryption.extractAad(parseEnvelope(envelope).encryptedBlob));
}

function parseEnvelope(envelope) {
  var keyLength, blobLength;
  
  if (!envelope || envelope.length < HEADER_LENGTH) {
    throw new Error("Invalid data");
  }
  
  keyLength = envelope.readInt32LE(ENCRYPTED_KEY_LENGTH_OFFSET);
  blobLength = envelope.readInt32LE(ENCRYPTED_BLOB_LENGTH_OFFSET);
  
  if (keyLength < 0 || blobLength < 0 || HEADER_LENGTH + keyLength + blobLength !== envelope.length) {
    throw new Error("Invalid data");
  }
  
  return {
    encryptedKey: envelope.slice(HEADER_LENGTH, HEADER_LENGTH + keyLength),
    encryptedBlob: envelope.slice(HEADER_LENGTH + keyLength, HEADER_LENGTH + keyLength + blobLength)
  }
}

exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.extractAad = extractAad;
