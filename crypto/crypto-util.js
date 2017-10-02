const MAX_INT_16 = 32767;
const MAX_INT_32 = 2147483647;

const MAX_AAD_LENGTH = MAX_INT_16;

const ALGORITHMS = {
  "aes-256-gcm": {keyLength: 32, ivLength: 12, openSslName: "aes-256-gcm"},
  "aes-128-gcm": {keyLength: 16, ivLength: 12, openSslName: "aes-128-gcm"}
};

function verifyLengthInt16(buf, valueName) {
  if (buf.length > MAX_INT_16) {
    throw new Error((valueName || "Value") + " exceeds maximum length (" + MAX_INT_16 + " bytes)")
  }
}

function verifyLengthInt32(buf, valueName) {
  if (buf.length > MAX_INT_32) {
    throw new Error((valueName || "Value") + " exceeds maximum length (" + MAX_INT_32 + " bytes)")
  }
}

function encodeAadBuffer(obj) {
  var i, keys, bKey, value, bValue, header, arrayForm = [], nBytes;
  
  if (obj == null) {
    return Buffer.alloc(0);
  }
  
  keys = Object.keys(obj).sort();
  for (i = 0; i < keys.length; i++) {
    bKey = Buffer.from(keys[i]);
    verifyLengthInt16(bKey, "Key");
    value = obj[keys[i]];
    if (typeof value !== "string") {
      throw new Error("Value must be a string");
    }
    bValue = Buffer.from(value);
    verifyLengthInt16(bValue, "Value");
    
    header = Buffer.alloc(4);
    header.writeInt16LE(bKey.length, 0);
    header.writeInt16LE(bValue.length, 2);
    arrayForm.push(header);
    arrayForm.push(bKey);
    arrayForm.push(bValue);
  }
  
  nBytes = 0;
  for (i = 0; i < arrayForm.length; i++) {
    nBytes += arrayForm[i].length;
  }
  
  if (nBytes > MAX_AAD_LENGTH) {
    throw new Error("AAD is too long");
  }
  
  return Buffer.concat(arrayForm);
}

function decodeAadBuffer(buf) {
  var result, keyLength, valueLength, offset, key, value;
  
  if (!buf || !buf.length) {
    return {};
  }
  
  if (buf.length > MAX_AAD_LENGTH) {
    throw new Error("AAD is too long");
  }
  
  result = {};
  offset = 0;
  while (offset < buf.length) {
    keyLength = buf.readInt16LE(offset);
    offset += 2;
    valueLength = buf.readInt16LE(offset);
    offset += 2;
    key = buf.toString("utf8", offset, offset + keyLength);
    offset += keyLength;
    value = buf.toString("utf8", offset, offset + valueLength);
    offset += valueLength;
    result[key] = value;
  }
  
  return result;
}

exports.ALGORITHMS = ALGORITHMS;
exports.MAX_INT_16 = MAX_INT_16;
exports.MAX_INT_32 = MAX_INT_32;
exports.MAX_AAD_LENGTH = MAX_AAD_LENGTH;

exports.verifyLengthInt16 = verifyLengthInt16;
exports.verifyLengthInt32 = verifyLengthInt32;
exports.encodeAadBuffer = encodeAadBuffer;
exports.decodeAadBuffer = decodeAadBuffer;
