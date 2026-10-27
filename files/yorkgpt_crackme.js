// YorkGPT kill-switch validator  (obfuscated build 2.6)
// Usage:  node yorkgpt_crackme.js "<code>"
var _0x3a=["cm9ndWU=","MTYmPB4YWxFBFhEdVgURLRoJRQcUGhQWUQZcAwg="];
function _d(_0x1){return atob(_0x3a[_0x1]);}
function _x(_0xk,_0xt){var _o=[];for(var _i=0;_i<_0xt.length;_i++){_o.push(_0xt.charCodeAt(_i)^_0xk.charCodeAt(_i%_0xk.length));}return _o;}
function validate(_0xin){
  var _k=_d(0),_t=_d(1);
  if(_0xin.length!==_t.length)return false;
  var _c=_x(_k,_0xin);
  for(var _i=0;_i<_t.length;_i++){if(_c[_i]!==_t.charCodeAt(_i))return false;}
  return true;
}
var _ans=(typeof process!=='undefined'&&process.argv[2])||'';
console.log(validate(_ans)?('ACCESS GRANTED :: kill-switch code accepted => '+_ans):'ACCESS DENIED');
