const util = require("util");

var escapeMapForHtml = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;"
};

var htmlEncodeChars = /[\x00<>"'&]/g;

function replacerForHtml(ch) {
  return escapeMapForHtml[ch]
    // Intentional assignment that caches the result of encoding ch.
    || (escapeMapForHtml[ch] = "&#" + ch.charCodeAt(0) + ";");
}

function toHtml(value) {
  // Adapted from https://github.com/BorisMoore/jsrender
  return value != undefined ? String(value).replace(htmlEncodeChars, replacerForHtml) : "";
}

function noop() {}

function defaults(givenObject, defaultObject1) {
  var propName, i, defaultObject;
  
  if (givenObject == null) {
    givenObject = {};
  }
  
  for (i = 1; i < arguments.length; i++) {
    defaultObject = arguments[i];
    for (propName in defaultObject) {
      if (defaultObject.hasOwnProperty(propName) && !givenObject.hasOwnProperty(propName)) {
        givenObject[propName] = defaultObject[propName];
      }
    }
  }
  
  return givenObject;
}


class WebError extends Error {
  constructor(htmlErrorCode, message) {
    super(message);
    Object.defineProperty(this, "name", {
      value: this.constructor.name
    });
    Object.defineProperty(this, "htmlErrorCode", {
      value: htmlErrorCode
    });
    Error.captureStackTrace(this, this.constructor);
  }
}

function getEmailFromCert(userCertificate) {
  if (userCertificate.subjectaltname && userCertificate.subjectaltname.startsWith("email:")) {
    return userCertificate.subjectaltname.slice(6);
  }
  if (userCertificate.subject && userCertificate.subject.emailAddress && userCertificate.subject.emailAddress.length) {
    return userCertificate.subject.emailAddress;
  }
  return null;
}

exports.noop = noop;
exports.toHtml = toHtml;
exports.WebError = WebError;
exports.defaults = defaults;
exports.getEmailFromCert = getEmailFromCert;