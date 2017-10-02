const crypto = require("crypto");
const cryptoUtil = require("./crypto-util");

const VERSION = 1;

const HEADER_LENGTH = 16;

const VERSION_OFFSET = 0;
const KEY_ID_LENGTH_OFFSET = 2;
const ALGORITHM_LENGTH_OFFSET = 4;
const IV_LENGTH_OFFSET = 6;
const AUTH_TAG_LENGTH_OFFSET = 8;
const AAD_LENGTH_OFFSET = 10;
const ENCRYPTED_DATA_LENGTH_OFFSET = 12;

function encrypt(rawData, keyId, key, algorithm, aad, embedAad, callback) {
  var encrypter, b1, b2, encryptedBlob, algoInfo, workingData;
  
  if (!cryptoUtil.ALGORITHMS.hasOwnProperty(algorithm)) {
    callback(new Error("Invalid keySpec"));
    return;
  }
  algoInfo = cryptoUtil.ALGORITHMS[algorithm];
  
  if (aad && aad.length > cryptoUtil.MAX_AAD_LENGTH) {
    callback(new Error("AAD exceeds maximum length (" + cryptoUtil.MAX_AAD_LENGTH + " bytes)"));
    return;
  }
  
  try {
    workingData = {};
    workingData.keyId = keyId || "";
    workingData.algorithm = algoInfo.openSslName;
    workingData.iv = crypto.randomBytes(algoInfo.ivLength);
    workingData.aad = aad;
    workingData.embedAad = embedAad;
  
    encrypter = crypto.createCipheriv(workingData.algorithm, key, workingData.iv);
    
    if (workingData.aad && workingData.aad.length) {
      encrypter.setAAD(workingData.aad);
    }
    
    b1 = encrypter.update(rawData);
    b2 = encrypter.final();
  
    workingData.authTag = encrypter.getAuthTag();
    workingData.encryptedData = Buffer.concat([b1, b2]);
  
    encryptedBlob = packEncryptedBlob(workingData);
  } catch (e) {
    callback(e);
    return;
  }
  
  setImmediate(callback, null, encryptedBlob);
  
}

function decrypt(encryptedBlob, key, aad, callback) {
  var decrypter, b1, b2, data;
  
  try {
    data = unpackEncryptedBlob(encryptedBlob);
    decrypter = crypto.createDecipheriv(data.algorithm, key, data.iv);
    decrypter.setAuthTag(data.authTag);
    
    if (aad && aad.length) {
      decrypter.setAAD(aad);
    } else if (data.aad.length) {
      decrypter.setAAD(data.aad);
    }
    
    b1 = decrypter.update(data.encryptedData);
    b2 = decrypter.final();
  } catch (e) {
    callback(e);
    return;
  }
  
  setImmediate(callback, null, Buffer.concat([b1, b2]), data.aad);
}

function packEncryptedBlob(data) {
  var header, algo, keyId, aadToEmbed;
  
  algo = Buffer.from(data.algorithm);
  keyId = Buffer.from(data.keyId || "");
  
  if (!data.embedAad || !data.aad) {
    aadToEmbed = Buffer.alloc(0);
  } else {
    aadToEmbed = data.aad;
  }
  
  
  cryptoUtil.verifyLengthInt16(keyId, "KeyId");
  cryptoUtil.verifyLengthInt16(algo, "Algorithm");
  cryptoUtil.verifyLengthInt16(data.iv, "IV");
  cryptoUtil.verifyLengthInt16(data.authTag, "authTag");
  cryptoUtil.verifyLengthInt16(aadToEmbed, "AAD");
  cryptoUtil.verifyLengthInt32(data.encryptedData, "Plaintext");
  
  header = Buffer.alloc(HEADER_LENGTH);
  
  header.writeInt16LE(VERSION, VERSION_OFFSET);
  header.writeInt16LE(keyId.length, KEY_ID_LENGTH_OFFSET);
  header.writeInt16LE(algo.length, ALGORITHM_LENGTH_OFFSET);
  header.writeInt16LE(data.iv.length, IV_LENGTH_OFFSET);
  header.writeInt16LE(data.authTag.length, AUTH_TAG_LENGTH_OFFSET);
  header.writeInt16LE(aadToEmbed.length, AAD_LENGTH_OFFSET);
  header.writeInt32LE(data.encryptedData.length, ENCRYPTED_DATA_LENGTH_OFFSET);
  
  return Buffer.concat([header, keyId, algo, data.iv, data.authTag, aadToEmbed, data.encryptedData]);
  
}

function unpackEncryptedBlob(encryptedBlob) {
  var offset, version, keyIdLength, algoLength, ivLength, authTagLength, aadLength, encryptedDataLength, result = {};

  version = encryptedBlob.readInt16LE(VERSION_OFFSET);
  
  if (version !== VERSION) {
    throw new Error("Invalid data version");
  }
  
  keyIdLength = encryptedBlob.readInt16LE(KEY_ID_LENGTH_OFFSET);
  algoLength = encryptedBlob.readInt16LE(ALGORITHM_LENGTH_OFFSET);
  ivLength = encryptedBlob.readInt16LE(IV_LENGTH_OFFSET);
  authTagLength = encryptedBlob.readInt16LE(AUTH_TAG_LENGTH_OFFSET);
  aadLength = encryptedBlob.readInt16LE(AAD_LENGTH_OFFSET);
  encryptedDataLength = encryptedBlob.readInt32LE(ENCRYPTED_DATA_LENGTH_OFFSET);

  if (encryptedBlob.length !== (HEADER_LENGTH + keyIdLength + algoLength + ivLength + authTagLength + aadLength + encryptedDataLength)) {
    throw new Error("Invalid data format");
  }
  
  offset = HEADER_LENGTH;
  result.keyId = encryptedBlob.toString("utf8", offset, offset + keyIdLength);
  offset += keyIdLength;

  result.algorithm = encryptedBlob.toString("utf8", offset, offset + algoLength);
  
  if (!cryptoUtil.ALGORITHMS.hasOwnProperty(result.algorithm)) {
    throw new Error("Unknown algorithm");
  }
  offset += algoLength;
  result.iv = encryptedBlob.slice(offset, offset + ivLength);
  offset += ivLength;
  result.authTag = encryptedBlob.slice(offset, offset + authTagLength);
  offset += authTagLength;
  result.aad = encryptedBlob.slice(offset, offset + aadLength);
  offset += aadLength;
  result.encryptedData = encryptedBlob.slice(offset);
  
  return result;
}

function extractKeyId(encryptedBlob) {
  var keyIdLength;
  
  if (!encryptedBlob || (encryptedBlob.length < HEADER_LENGTH) || encryptedBlob.readInt16LE(VERSION_OFFSET) !== VERSION) {
    throw new Error("Invalid version");
  }
  keyIdLength = encryptedBlob.readInt16LE(KEY_ID_LENGTH_OFFSET);
  if (HEADER_LENGTH + keyIdLength > encryptedBlob.length) {
    throw new Error("Invalid data");
  }
  return encryptedBlob.toString("utf8", HEADER_LENGTH, HEADER_LENGTH + keyIdLength);
}

function extractAad(encryptedBlob) {
  return unpackEncryptedBlob(encryptedBlob).aad;
}

exports.decrypt = decrypt;
exports.encrypt = encrypt;
exports.extractKeyId = extractKeyId;
exports.extractAad = extractAad;
