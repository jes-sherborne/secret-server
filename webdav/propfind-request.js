const sax = require("sax");

function createFromRequest(req, knownProperties, callback) {
  parseBody(req, knownProperties, function(err, result) {
    if (err) {
      callback(err);
      return;
    }
    
    if (result.isError) {
      callback(null, result);
      return;
    }
    
    result.method = "PROPFIND";
    result.path = req.path;
    result.depth = depthHeader(req);
    
    callback(null, result);
  });
}

function depthHeader(req) {
  var depth = req.headers.depth;
  
  if (depth == null) {
    return Infinity;
  }
  switch (depth.toString()) {
    case "0":
      return 0;
    case "1":
      return 1;
    default:
      return Infinity;
  }
}

function parseBody(req, knownProperties, callback) {
  var parser;
  var hasError = false;
  var done = false;
  
  var depth = 0;
  var path = [];

  parser = sax.parser(true);
  
  var p = {
    allProp: null,
    prop: null,
    include: null,
    propName: null
  };
  
  parser.onopentag = onOpenTag;
  parser.onclosetag = onCloseTag;
  parser.onerror = onParserError;
  parser.onend = onParserEnd;
  
  parser.write(req.rawBody).close();
  
  function onOpenTag(node) {
    var nameSplit, name, lowerName, contextPath;
  
    if (done || hasError) {
      return;
    }
  
    depth++;
    if (depth > 3) {
      return;
    }
  
    nameSplit = node.name.split(":", 2);
    if (nameSplit.length === 2) {
      name = nameSplit[1];
    } else {
      name = nameSplit[0];
    }
    lowerName = name.toLowerCase();
  
    contextPath = path.join("/");
    path.push(lowerName);
  
    switch (lowerName) {
      case "propfind":
        return;
      case "prop":
        if (contextPath === "propfind") {
          p.prop = {};
          p.allProp = null;
          p.propName = null;
        }
        return;
      case "allprop":
        if (contextPath === "propfind") {
          p.prop = null;
          p.allProp = true;
          p.propName = false;
        }
        return;
      case "include":
        if (contextPath === "propfind") {
          p.include = {};
        }
        return;
      case "propname":
        if (contextPath === "propfind") {
          p.prop = null;
          p.allProp = false;
          p.propName = true;
        }
        return;
    }
  
    if (contextPath === "propfind/prop") {
      if (!p.prop[lowerName]) {
        p.prop[lowerName] = name;
      }
    } else if (contextPath === "propfind/include") {
      if (!p.include[lowerName]) {
        p.include[lowerName] = name;
      }
    }
  }
  
  function onCloseTag() {
    var contextPath;
    
    if (done || hasError) {
      return;
    }
    
    depth--;
    if (depth >= 3) {
      return;
    }
    
    contextPath = path.join("/");
    path.pop();
    
    if (contextPath === "propfind") {
      done = true;
    }
  }
  
  function onParserError() {
    hasError = true;
    callback(null, {
      isError: true,
      responseCode: 400,
      innerError: parser.error
    });
  }
  
  function onParserEnd() {
    var finalPropSet = {}, finalUnknownSet = {};
  
    if (hasError) {
      // already invoked callback;
      return;
    }
  
    if (p.propName) {
      callback(null, {propName: true});
      return;
    }
  
    if (p.allProp || !hasAnyOwnProperties(p.prop)) {
      objectEach(knownProperties, function(key, value) {
        if (value.allprop) {
          finalPropSet[key] = true;
        }
      });
      if (p.allProp && p.include) {
        objectEach(p.include, processPropName);
      }
    } else {
      objectEach(p.prop, processPropName);
    }
    
    callback(null, {
      props: Object.keys(finalPropSet),
      unknownProps: Object.keys(finalUnknownSet)
    });
  
    function processPropName(propName) {
      if (knownProperties.hasOwnProperty(propName)) {
        finalPropSet[propName] = true;
      } else {
        finalUnknownSet[propName] = true;
      }
    }
  }
}

function hasAnyOwnProperties(obj) {
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      return true;
    }
  }
  return false;
}

function objectEach(obj, fn) {
  if (obj == null) {
    return;
  }
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      fn(key, obj);
    }
  }
}
function nsKey(prefix) {
  return prefix && prefix.length ? prefix.toLowerCase() : ""
}

exports.createFromRequest = createFromRequest;