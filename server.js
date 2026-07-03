require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globais
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos (HTML, CSS, JS do frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API
app.use('/api', apiRoutes);

// Rota raiz para servir o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicialização do servidor
app.listen(PORT, () => {
    console.log(`[DashEstoque] Servidor rodando em http://localhost:${PORT}`);
});