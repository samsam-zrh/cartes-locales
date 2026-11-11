const $ = selector => document.querySelector(selector);
const rarities = {C:'Commune',PC:'Peu commune',R:'Rare',SR:'Super rare',UR:'Ultra rare',L:'Légendaire'};
let state, catalogue = [], achievements = [], drawn = [], busy = false;
let currentPage = 'packs';
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, action) {
  const node = element('button', text);
  node.addEventListener('click', action);
  return node;
}
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'La demande a échoué.');
  return data;
}
function notice(text, error = false) {
  $('#notice').textContent = text;
  $('#notice').classList.toggle('error', error);
}
function controls() {
  document.querySelectorAll('main button, nav button, header select, main input, main select').forEach(node => {
    node.disabled = busy || !state || node.dataset.unavailable === 'true';
  });
  $('#retry').disabled = busy;
  $('#open').disabled = busy || !state || state.packs < 1;
}
async function run(work) {
  if (busy) return;
  busy = true; controls();
  try { await work(); } catch (error) { notice(error.message || 'Connexion impossible. Réessayez.', true); }
  finally { busy = false; controls(); }
}
async function refresh() {
  const results = await Promise.all([api('/api/state'), api('/api/cards?limit=100'), api('/api/achievements')]);
  [state] = results;
  catalogue = results[1].cards;
  achievements = results[2].achievements;
  $('#balance').textContent = state.user.coins + ' pièces · ' + state.stats.totalCards + ' cartes';
  $('#stock').textContent = state.packs + ' paquet(s) disponible(s) sur 10';
  renderCollection(); renderRewards();
}
function cardView(card, favorite = false) {
  const node = element('article', undefined, 'card');
  const art = element('div', '◇', 'art'); art.setAttribute('aria-hidden','true');
  node.append(art, element('span',rarities[card.rarity] || card.rarity,'badge'), element('h2',card.title));
  node.append(element('p','ATK ' + card.atk + ' · DEF ' + card.def,'stats'));
  const actions = element('div',undefined,'card-actions');
  actions.append(button('Détails', () => {
    const body = $('#detail-body'); body.replaceChildren(element('h2',card.title),element('p',card.description),element('p','Carte fictive · ' + rarities[card.rarity]),element('p','ATK ' + card.atk + ' · DEF ' + card.def));
    $('#detail').showModal();
  }));
  if (favorite) {
    const fav = button(card.favorite ? 'Retirer des favoris' : 'Favori', () => run(async () => {
      await api('/api/cards/' + encodeURIComponent(card.id) + '/favorite', {value:!card.favorite});
      await refresh(); notice('Favoris mis à jour.');
    }));
    fav.setAttribute('aria-pressed',String(card.favorite));
    actions.append(fav);
    node.append(element('small',card.ownedCount + ' exemplaire(s)'));
  }
  node.append(actions); return node;
}
function renderCollection() {
  const query = $('#search').value.trim().toLocaleLowerCase('fr');
  const rarity = $('#rarity').value;
  const cards = catalogue.filter(card => card.ownedCount > 0 && (!rarity || card.rarity === rarity) && card.title.toLocaleLowerCase('fr').includes(query));
  $('#cards').replaceChildren(...cards.map(card => cardView(card,true)));
  $('#count').textContent = cards.length ? cards.length + ' titres dans votre collection' : 'Aucune carte pour cette recherche.';
}
function renderRewards() {
  $('#rewards').replaceChildren(...achievements.map(achievement => {
    const node = element('article',undefined,'reward');
    node.append(element('h2',achievement.title), element('p',achievement.progress + ' / ' + achievement.target + ' · ' + achievement.reward + ' pièces'));
    const claim = button(achievement.claimed ? 'Déjà réclamée' : achievement.unlocked ? 'Réclamer' : 'À débloquer', () => run(async () => {
      await api('/api/achievements/' + encodeURIComponent(achievement.id) + '/claim', {});
      await refresh(); notice('Récompense ajoutée.');
    }));
    claim.dataset.unavailable = String(achievement.claimed || !achievement.unlocked);
    claim.disabled = achievement.claimed || !achievement.unlocked;
    node.append(claim); return node;
  }));
}
function navigate(page) {
  if (busy || !state) return;
  currentPage = page;
  for (const name of ['packs','collection','achievements']) $('#' + name).hidden = name !== page;
  document.querySelectorAll('nav button').forEach(node => {
    if (node.dataset.page === page) node.setAttribute('aria-current','page'); else node.removeAttribute('aria-current');
  });
  $('#heading').textContent = {packs:'Ouvrir un paquet',collection:'Votre collection',achievements:'Vos succès'}[page];
  $('#heading').focus();
}
async function login() {
  notice('Connexion au joueur local…');
  await api('/api/login', {userId:Number($('#player').value)});
  drawn = []; $('#draw').replaceChildren();
  await refresh(); $('#retry').hidden = true;
  notice('Joueur local prêt.');
}
$('#open').addEventListener('click', () => run(async () => {
  notice('Ouverture…');
  const result = await api('/api/packs/open', {});
  drawn = result.cards;
  $('#draw').replaceChildren(...drawn.map(card => cardView(card)));
  await refresh(); notice('Cinq cartes ajoutées à votre collection.');
}));
$('#refill').addEventListener('click', () => run(async () => { await api('/api/packs/refill', {}); await refresh(); notice('Stock rechargé gratuitement.'); }));
$('#player').addEventListener('change', () => run(async () => {
  try { await login(); } catch (error) { state = undefined; $('#retry').hidden = false; throw error; }
}));
$('#retry').addEventListener('click', () => run(login));
document.querySelectorAll('nav button').forEach(node => node.addEventListener('click', () => navigate(node.dataset.page)));
$('#search').addEventListener('input',renderCollection);
$('#rarity').addEventListener('change',renderCollection);
run(async () => { try { await login(); } catch (error) { $('#retry').hidden = false; throw error; } });
