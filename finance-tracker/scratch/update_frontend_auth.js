import fs from 'fs';

const filePath = 'C:/Users/ADM/.gemini/antigravity/scratch/finance-tracker/public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// 1. Adicionar Botão de Sair e Exibição de Usuário no Rodapé da Sidebar
const sidebarFooterAntigo = `    <!-- Status no Rodapé da Sidebar -->
    <div class="p-4 border-t border-slate-900 bg-slate-950/80 text-xs text-slate-400 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
        <span class="text-[11px]">Travas Inteligentes</span>
      </div>
      <span class="text-[10px] text-slate-500 font-mono">v1.2.0</span>
    </div>
  </aside>`;

const sidebarFooterNovo = `    <!-- Usuário Logado & Botão Sair -->
    <div class="p-3.5 border-t border-slate-900 bg-slate-950/90 text-xs space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
            <i class="fa-regular fa-user"></i>
          </div>
          <div class="min-w-0">
            <p id="labelUsuarioNome" class="text-xs font-semibold text-slate-200 truncate">Usuário</p>
            <p id="labelUsuarioEmail" class="text-[10px] text-slate-500 truncate">usuario@email.com</p>
          </div>
        </div>
      </div>
      <button 
        onclick="fazerLogout()" 
        class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition cursor-pointer"
        title="Encerrar sessão com segurança"
      >
        <i class="fa-solid fa-arrow-right-from-bracket"></i>
        <span>Sair da Conta</span>
      </button>
    </div>
  </aside>`;

html = html.replace(sidebarFooterAntigo, sidebarFooterNovo);

// 2. Início do script com Verificação de Token JWT e fetchAuth global
const scriptStartAntigo = `  <!-- ==================== SCRIPTS ==================== -->
  <script>
    let mesAtualKey = new Date().toISOString().slice(0, 7); // ex: '2026-11'`;

const scriptStartNovo = `  <!-- ==================== SCRIPTS ==================== -->
  <script>
    // 1. Verificação de Autenticação Imediata
    const tokenSalvo = localStorage.getItem('token');
    if (!tokenSalvo) {
      window.location.href = '/login.html';
    }

    // Função de Logout Seguro
    function fazerLogout() {
      localStorage.removeItem('token');
      localStorage.removeItem('usuarioNome');
      localStorage.removeItem('usuarioEmail');
      window.location.href = '/login.html';
    }

    // Função utilitária fetchAuth para anexar Authorization Bearer automaticamente
    async function fetchAuth(url, options = {}) {
      const token = localStorage.getItem('token');
      if (!token) {
        window.location.href = '/login.html';
        return;
      }
      
      const headers = {
        ...(options.headers || {}),
        'Authorization': 'Bearer ' + token
      };

      const res = await fetch(url, { ...options, headers });
      if (res.status === 401 || res.status === 403) {
        fazerLogout();
        throw new Error('Sessão expirada. Redirecionando para login...');
      }
      return res;
    }

    let mesAtualKey = new Date().toISOString().slice(0, 7); // ex: '2026-11'`;

html = html.replace(scriptStartAntigo, scriptStartNovo);

// 3. Substituir chamadas de fetch() por fetchAuth() dentro do index.html
html = html.replaceAll('await fetch(', 'await fetchAuth(');
html = html.replaceAll('return fetch(', 'return fetchAuth(');

// 4. Carregar dados do usuário na interface
const onloadAntigo = `window.onload = async () => {
      inicializarGraficoBudget();`;

const onloadNovo = `window.onload = async () => {
      // Exibe nome e e-mail do usuário logado na sidebar
      const nomeUser = localStorage.getItem('usuarioNome') || 'Usuário';
      const emailUser = localStorage.getItem('usuarioEmail') || '';
      const elNome = document.getElementById('labelUsuarioNome');
      const elEmail = document.getElementById('labelUsuarioEmail');
      if (elNome) elNome.textContent = nomeUser;
      if (elEmail) elEmail.textContent = emailUser;

      inicializarGraficoBudget();`;

html = html.replace(onloadAntigo, onloadNovo);

fs.writeFileSync(filePath, html, 'utf8');
console.log('Frontend index.html updated with JWT auth and logout successfully');
