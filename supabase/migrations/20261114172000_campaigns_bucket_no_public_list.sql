-- O link direto da imagem continua público. Listar todos os arquivos do bucket não.
DROP POLICY IF EXISTS "public read campaigns bucket" ON storage.objects;
