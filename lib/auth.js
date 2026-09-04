import crypto from 'node:crypto'; import {promisify} from 'node:util';
const scrypt=promisify(crypto.scrypt); export const SESSION_TTL_MS=8*60*60*1000;
export async function hashPassword(password){if(typeof password!=='string'||password.length<10||password.length>200)throw new Error('invalid_admin_password');const salt=crypto.randomBytes(16);const hash=await scrypt(password,salt,32);return `scrypt:${salt.toString('base64url')}:${Buffer.from(hash).toString('base64url')}`;}
export async function verifyPassword(password,stored=''){try{const [,saltText,hashText]=stored.split(':');const expected=Buffer.from(hashText,'base64url');const actual=Buffer.from(await scrypt(password,Buffer.from(saltText,'base64url'),expected.length));return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}catch{return false;}}
export function sessionStore(ttl=SESSION_TTL_MS){const sessions=new Map();return{create(){const token=crypto.randomBytes(32).toString('base64url');sessions.set(token,Date.now()+ttl);return token;},valid(token){const expiry=sessions.get(token);if(!expiry||expiry<Date.now()){sessions.delete(token);return false;}return true;},remove(token){sessions.delete(token);},cleanup(){for(const [key,expiry] of sessions)if(expiry<Date.now())sessions.delete(key);},get size(){return sessions.size;}};}
export function cookieValue(header='',name='arrsight_session'){return header.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)||'';}
export function requestIsSecure(req,{trustProxy=process.env.ARRSIGHT_TRUST_PROXY==='true'}={}){if(req.socket?.encrypted)return true;const proto=String(req.headers?.['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase();return proto==='https'&&trustProxy;}
export function sessionCookie(token,{secure=false}={}){return `arrsight_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS/1000}${secure?'; Secure':''}`;}
export function clearedSessionCookie(secure=false){return `arrsight_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`;}
export function timingSafeEqualString(a,b){const left=Buffer.from(String(a??''));const right=Buffer.from(String(b??''));if(left.length!==right.length)return false;return left.length>0&&crypto.timingSafeEqual(left,right);}

// Client key for login throttling. Forwarded headers are client-controlled and
// are only honored when the operator explicitly opted in via ARRSIGHT_TRUST_PROXY=true
// (i.e. ArrSight sits behind a trusted reverse proxy that sets them).
export function clientAddress(req,{trustProxy=process.env.ARRSIGHT_TRUST_PROXY==='true'}={}){
  if(trustProxy){const forwarded=String(req.headers?.['x-forwarded-for']||'').split(',')[0].trim();if(forwarded)return forwarded;}
  return req.socket?.remoteAddress||'unknown';
}

export const SETUP_CODE_TTL_MS=30*60*1000;
export function newSetupCode(){return{code:crypto.randomBytes(18).toString('base64url'),expiresAt:Date.now()+SETUP_CODE_TTL_MS};}
export function setupCodeMatches(submitted,state,now=Date.now()){if(typeof state?.code!=='string'||typeof submitted!=='string')return false;if(now>state.expiresAt)return false;return timingSafeEqualString(submitted,state.code);}
