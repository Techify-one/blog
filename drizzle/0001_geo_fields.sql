-- Additive migration: GEO / AI-citation fields on articles.
-- Run once per environment with `npm run db:migrate:geo:local` or :remote.
--
-- Fields:
--   hero_image_url    URL da imagem hero (usada em og:image e Article.image).
--   key_takeaways     JSON: string[] — 5 bullets curtos ("Principais conclusões").
--   faq               JSON: {q,a}[]  — perguntas que viram schema FAQPage.
--   reading_time_min  Tempo de leitura em minutos (200 wpm sobre <p>/<li>).

ALTER TABLE articles ADD COLUMN hero_image_url TEXT;
ALTER TABLE articles ADD COLUMN key_takeaways TEXT;
ALTER TABLE articles ADD COLUMN faq TEXT;
ALTER TABLE articles ADD COLUMN reading_time_min INTEGER;
