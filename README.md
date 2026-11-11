# Cartes locales

Je prépare une démo indépendante de collection de cartes fictives, avec paquets, favoris et succès. Le projet est encore en cours.

Avec Node 24 ou plus récent, depuis ce dossier :

    node server.mjs

Puis ouvrir http://127.0.0.1:4173 (ou le port affiché). Pour les tests avec base temporaire :

    node --test

Les 24 cartes et leurs statistiques sont créées pour cette démo. Les 51 succès utilisent les règles locales du backend. Les trois joueurs sont des comptes de démonstration ; aucune connexion au site d’origine.

Les données restent dans une base SQLite locale. Cette app est prévue pour une utilisation sur ce Mac, pas pour un hébergement public. Les échanges, le marché et les batailles ne sont pas encore accessibles dans cette interface. Voir docs/ORIGINE.md.
