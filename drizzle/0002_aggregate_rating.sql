-- Additive migration: aggregate_rating field on articles.
-- Run once per environment with `npm run db:migrate:rating:local` or :remote.
--
-- Field:
--   aggregate_rating  JSON: { value: number, count: number, best?: number, worst?: number }
--                     Usado apenas em artigos de review/comparação de ferramentas
--                     com metodologia de avaliação explícita. Emite
--                     schema.org/AggregateRating no Article JSON-LD.
--
-- IMPORTANTE: só preencher quando houver critério de avaliação genuíno
-- documentado no próprio artigo. Emitir rating sem review real por trás
-- viola as Google Search Essentials (review snippet guidelines) e pode
-- acionar manual action.

ALTER TABLE articles ADD COLUMN aggregate_rating TEXT;
