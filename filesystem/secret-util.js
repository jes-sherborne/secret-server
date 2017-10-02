const crypto = require("crypto");

function isValidGroupName(name) {
  if (typeof name !== "string") {
    return false;
  }
  if (name.length < 1 || name.length > 64) {
    return false;
  }
  return /^[a-z0-9_-]+$/.test(name);
}

function isValidGroupSet(groups) {
  if (!(groups instanceof Set)) {
    return false;
  }
  for (var groupName of groups) {
    if (!isValidGroupName(groupName)) {
      return false;
    }
  }
  return true;
}

function bufferFromGroups(groups) {
  return Buffer.from(Array.from(groups).sort().join("|"));
}

function groupsFromBuffer(buf) {
  return new Set(buf.length ? buf.toString().split("|") : null);
}

function getMd5(data) {
  var hash = crypto.createHash("md5");
  hash.update(data);
  return hash.digest("base64");
}

function setsIntersect(s1, s2) {
  var smaller, larger;
  
  if (!s1 || !s2) {
    return false;
  }
  if (s1.size <= s2.size) {
    smaller = s1;
    larger = s2;
  } else {
    smaller = s2;
    larger = s1;
  }
  for (var key of smaller) {
    if (larger.has(key)) {
      return true;
    }
  }
  return false;
}


exports.isValidGroupName = isValidGroupName;
exports.isValidGroupSet = isValidGroupSet;
exports.bufferFromGroups = bufferFromGroups;
exports.groupsFromBuffer = groupsFromBuffer;
exports.getMd5 = getMd5;
exports.setsIntersect = setsIntersect;
