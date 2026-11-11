import {existsSync,readFileSync} from 'node:fs';
import {parse,RARITIES} from './database.mjs';

// Conditions are derived from the captured French descriptions, not their list position.
function sourceRule(description){
  const text=description.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  const number=Number(text.match(/\d+/)?.[0]||1);
  const rarity=text.includes('super rare')?'SR':text.includes('ultra rare')?'UR':text.includes('legendaire')?'L':null;
  if(text.includes('premiere carte')&&rarity)return {key:'rarity:'+rarity,threshold:1};
  if(text.includes('doublon'))return {key:'maxCopies',threshold:2};
  if(text.includes('copies de la meme'))return {key:'maxCopies',threshold:number};
  if(text.includes('favoris'))return {key:'favorites',threshold:number};
  if(text.includes('vitrine'))return {key:'showcase',threshold:4};
  if(text.includes('atk'))return {key:'maxATK',threshold:number};
  if(text.includes('def'))return {key:'maxDEF',threshold:number};
  if(text.includes('posseder'))return {key:rarity?'rarity:'+rarity:'totalCards',threshold:number};
  if(text.includes('contre-offres'))return {key:'counterOffers',threshold:number};
  if(text.includes('refuser'))return {key:'rejections',threshold:number};
  if(text.includes('echanges'))return {key:'trades',threshold:number};
  if(text.includes('batailles')&&text.includes('affilee'))return {key:'maxWinStreak',threshold:number};
  if(text.includes('batailles'))return {key:'wins',threshold:number};
  if(text.includes('5x'))return {key:'expensiveAuction',threshold:1};
  if(text.includes('vendre')&&rarity)return {key:'sold:'+rarity,threshold:1};
  if(text.includes('gagner')&&rarity)return {key:'bought:'+rarity,threshold:1};
  if(text.includes('vendre'))return {key:'sales',threshold:number};
  if(text.includes('encheres'))return {key:'purchases',threshold:number};
  if(text.includes('wikibidous'))return {key:'coins',threshold:number};
  throw new Error('Condition de succès non reconnue : '+description);
}
function fallbackDefinitions(){
  const out=[];
  const add=(key,threshold,title)=>out.push({key,threshold,title,description:title});
  for(const n of [1,5,10,25,50,100,250,500])add('packsOpened',n,`Ouvrir ${n} paquets`);
  for(const n of [1,10,25,50,100,250,500,1000])add('totalCards',n,`Posséder ${n} cartes`);
  for(const r of RARITIES)add('rarity:'+r,1,`Posséder une carte ${r}`);
  for(const n of [1,5,20])add('favorites',n,`Marquer ${n} cartes favorites`);
  for(const n of [1,5,20])add('wishlist',n,`Souhaiter ${n} cartes`);
  for(const n of [1,2,5])add('friends',n,`Ajouter ${n} amis`);
  for(const n of [1,10,50])add('messages',n,`Envoyer ${n} messages`);
  for(const [key,title] of [['listings','Créer une vente'],['bids','Faire une enchère'],['purchases','Acheter une carte'],['sales','Vendre une carte']])add(key,1,title);
  for(const n of [1,5,20])add('trades',n,`Réussir ${n} échanges`);
  for(const [key,n,title] of [['battles',1,'Jouer une bataille'],['battles',10,'Jouer dix batailles'],['wins',1,'Gagner une bataille'],['wins',10,'Gagner dix batailles']])add(key,n,title);
  add('guild',1,'Rejoindre une guilde');add('showcase',1,'Créer sa vitrine');
  for(const n of [100,1000,5000,10000])add('coins',n,`Détenir ${n} WB`);
  return out.map((r,i)=>({...r,id:'local-'+(i+1),condition:r.description,reward:10+(i%5)*5,localRule:true}));
}
export function achievementDefinitions(path){
  if(!path||!existsSync(path))return fallbackDefinitions();
  const source=parse(readFileSync(path,'utf8'),[]);
  const definitions=Array.isArray(source)?source:source.achievements;
  if(!Array.isArray(definitions)||definitions.length!==51)throw new Error('Le seed des succès doit contenir 51 définitions.');
  return definitions.map(a=>({...a,id:String(a.id),...sourceRule(a.description),condition:a.description,localRule:false}));
}
export function evaluateAchievements(store,userId,defs){
  const {all,get,run}=store;
  const counters=Object.fromEntries(all('SELECT key,value FROM counters WHERE user_id=?',userId).map(x=>[x.key,x.value]));
  const owned=all('SELECT c.json FROM ownership o JOIN cards c ON c.id=o.card_id WHERE o.discarded=0 AND o.user_id=?',userId).map(c=>JSON.parse(c.json));
  const user=get('SELECT coins,showcase FROM users WHERE id=?',userId);
  const flags=get('SELECT coalesce(sum(favorite),0) favorites,coalesce(sum(wishlist),0) wishlist FROM flags WHERE user_id=?',userId);
  const copies={};for(const c of owned)copies[c.id]=(copies[c.id]||0)+1;
  const values={...counters,...flags,totalCards:owned.length,maxCopies:Math.max(0,...Object.values(copies)),maxATK:Math.max(0,...owned.map(c=>c.atk)),maxDEF:Math.max(0,...owned.map(c=>c.def)),friends:get('SELECT count(*) n FROM friends WHERE a=? OR b=?',userId,userId).n,guild:get('SELECT count(*) n FROM guild_members WHERE user_id=?',userId).n,showcase:parse(user.showcase,[]).filter(id=>get('SELECT id FROM ownership WHERE id=? AND user_id=? AND discarded=0',id,userId)).length,coins:user.coins};
  for(const r of RARITIES)values['rarity:'+r]=owned.filter(c=>c.rarity===r).length;
  const unlocked=new Set(all('SELECT achievement_id FROM achievement_unlocks WHERE user_id=?',userId).map(x=>x.achievement_id));
  const claimed=new Set(all('SELECT achievement_id FROM claims WHERE user_id=?',userId).map(x=>x.achievement_id));
  return defs.map(a=>{const current=values[a.key]||0;if(current>=a.threshold&&!unlocked.has(a.id)){run('INSERT OR IGNORE INTO achievement_unlocks(user_id,achievement_id,unlocked_at) VALUES(?,?,?)',userId,a.id,Date.now());unlocked.add(a.id);}return {...a,progress:Math.min(current,a.threshold),current,target:a.threshold,unlocked:unlocked.has(a.id),claimed:claimed.has(a.id)};});
}
