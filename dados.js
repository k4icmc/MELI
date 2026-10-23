/* dados.js — acesso do painel + cópia de emergência do banco.
   - usuario: e-mail embaralhado (código dos caracteres, invertido).
     Na tela de login você digita o e-mail normal — maiúsculas ou minúsculas.
   - senha: hash SHA-256 da senha real. A senha NUNCA aparece neste arquivo.
   - produtos / categorias / configuracoes: preenchidos pelo botão
     "Copiar dados do banco" do painel. Se o banco parar, o site
     continua funcionando com estes dados. */
const dados = {
  gerado_em: null,
  produtos: [],
  categorias: [],
  configuracoes: {},
  acesso: {
    usuario: [109, 111, 99, 46, 108, 105, 97, 109, 103, 64, 49, 115, 118, 101, 100, 46, 99, 105, 97, 107],
    senha: "a3a8da0a069796723be3b4691bd69f6c1dafa6568d06e47fc265f737b6b9148a"
  }
};
