document.addEventListener('DOMContentLoaded', () => {
    const btnSearch = document.getElementById('btnSearch');
    const nickListInput = document.getElementById('nickList');
    const hotelSelect = document.getElementById('hotelSelect');
    const resultsGrid = document.getElementById('resultsGrid');
    const scanStatus = document.getElementById('scanStatus');
    const resultCount = document.getElementById('resultCount');
    
    const failuresToggle = document.getElementById('failuresToggle');
    const failuresBody = document.getElementById('failuresBody');
    const toggleIcon = document.getElementById('toggleIcon');
    const failuresListUI = document.getElementById('failuresList');
    const failCountUI = document.getElementById('failCount');
    const retryStatus = document.getElementById('retryStatus');
  
    const analyticsPanel = document.getElementById('analyticsPanel');
    const statMembros = document.getElementById('statMembros');
    const statNaoHabbo = document.getElementById('statNaoHabbo');
    const statNaoRegistrados = document.getElementById('statNaoRegistrados');
    const statModeradores = document.getElementById('statModeradores');
    const statIrregulares = document.getElementById('statIrregulares');
  
    let failedNicks = [];
    let scannedUsersData = [];
    let isRetrying = false;
    
    // Bancos de Dados em Memória
    let mapCargos = {}; 
    let mapCursos = {};

    // Hierarquias Oficiais para Validação de Regras
    const hierarquiaExecutiva = [
        "sócio", "agente", "analista", "coordenador", "promotor", "advogado",
        "administrador", "delegado", "investigador", "detetive", "supervisor",
        "líder", "líder-executivo", "chanceler", "inspetor", "inspetor-chefe", "superintendente", "diretor", "diretor-fundador", "vice-presidente", "presidente"
    ];

    const hierarquiaMilitar = [
        "soldado", "cabo", "sargento", "subtenente", "aspirante-a-oficial", "tenente",
        "capitão", "major", "tenente-coronel", "coronel", "general", "comandante", "comandante-geral", "supremo"
    ];
  
    // ==========================================
    // SINCRONIZAÇÃO FIREBASE (CARGOS E CURSOS)
    // ==========================================
    async function fetchDatabase() {
        const apiKey = "AIzaSyBcA6jZ4Uxul6e1JkDvW02MW4TqbQONWxk";
        const projectId = "overdrive-7f853";
        const urlCargos = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/configuracoes/cargos?key=${apiKey}`;
        const urlCursos = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/configuracoes/cursos?key=${apiKey}`;
  
        // Busca Cargos
        try {
            const res = await fetch(urlCargos);
            const json = await res.json();
            if (json.fields && json.fields.dados && json.fields.dados.stringValue) {
                const rawData = JSON.parse(json.fields.dados.stringValue);
                mapCargos = {};
                for (let key in rawData) mapCargos[key.trim().toLowerCase()] = rawData[key].trim();
            }
        } catch (e) { console.error("Falha ao baixar cargos:", e); }

        // Busca Cursos
        try {
            const res = await fetch(urlCursos);
            const json = await res.json();
            if (json.fields && json.fields.dados && json.fields.dados.stringValue) {
                const rawData = JSON.parse(json.fields.dados.stringValue);
                mapCursos = {};
                for (let key in rawData) mapCursos[key.trim().toLowerCase()] = rawData[key];
            }
        } catch (e) { console.error("Falha ao baixar cursos:", e); }
    }
  
    // ==========================================
    // LÓGICA DE API E BUSCA HABBO
    // ==========================================
    const PROXIES = [ 
        { url: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'json' },
        { url: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'raw' }
    ];
    
    async function fetchWithProxy(targetUrl) { 
        for (const proxy of PROXIES) { 
            try { 
                const res = await fetch(proxy.url(targetUrl)); 
                if (!res.ok) continue; 
                let text = proxy.type === 'json' ? (await res.json()).contents : await res.text();
                if (!text) continue;
                try { 
                    const data = JSON.parse(text); 
                    if (data && (data.uniqueId || data.error === "not-found" || data.user)) return data; 
                } catch(e) {} 
            } catch (e) {} 
        } 
        throw new Error("Proxy falhou"); 
    }
    
    async function fetchUserData(nick, telegram, domain) {
        const targetUrl = `https://www.habbo.${domain}/api/public/users?name=${encodeURIComponent(nick)}`;
        const baseData = await fetchWithProxy(targetUrl);
        
        if (baseData.error === "not-found" || (baseData.name && baseData.name.toLowerCase() !== nick.toLowerCase())) {
            return { exists: false, nick: nick, telegram: telegram };
        }
        return { exists: true, nick: baseData.name || nick, telegram: telegram, motto: baseData.motto || "Sem missão", domain: domain };
    }
  
    // ==========================================
    // REGRAS DE NEGÓCIO (MODERAÇÃO E CURSOS)
    // ==========================================
    function isModerator(motto) {
        if(!motto) return false;
        const chatType = document.querySelector('input[name="chatType"]:checked').value;
        const upperMotto = motto.toUpperCase();
        
        const globalRoles = ['INSPETOR', 'SUPERINTENDENTE', 'COMANDANTE', 'SUPREMO', 'PRESIDENTE', 'VICE-PRESIDENTE', 'PRESIDÊNCIA'];
        const isGlobalAdmin = globalRoles.some(role => upperMotto.includes(role));
        const isGoe = /\d/.test(upperMotto) && upperMotto.includes('ª');
  
        if (isGlobalAdmin || isGoe) return true;
  
        let acronyms = chatType === 'oficiais' ? ['C.AP', 'S.AP', 'CC.AP', 'S.SP', 'VL.SP', 'L.SP'] : ['CC.AP', 'S.AP', 'C.AP'];
        return acronyms.some(acronym => upperMotto.includes(acronym));
    }

    function checkRules(cargoDb, cursosDb, chatType) {
        if (!cargoDb) return { valid: false, msg: "Faltam Dados no System" };

        let cargoLower = cargoDb.toLowerCase();
        let idxExec = hierarquiaExecutiva.indexOf(cargoLower);
        let idxMil = hierarquiaMilitar.indexOf(cargoLower);

        let isM1 = cursosDb && cursosDb.m1.toLowerCase() === "aprovado";
        let isM3 = cursosDb && cursosDb.m3.toLowerCase() === "aprovado";

        if (chatType === "oficiais") {
            if (idxExec >= hierarquiaExecutiva.indexOf("administrador")) {
                if (!isM3) return { valid: false, msg: "Falta M3 Aprovado" };
            } else if (idxExec >= hierarquiaExecutiva.indexOf("promotor")) {
                if (!isM1) return { valid: false, msg: "Falta M1 Aprovado" };
            } else if (idxMil >= hierarquiaMilitar.indexOf("major")) {
                if (!isM3) return { valid: false, msg: "Falta M3 Aprovado" };
            }
        } else if (chatType === "pv") {
            let isHighRank = (idxExec >= hierarquiaExecutiva.indexOf("administrador")) || (idxMil >= hierarquiaMilitar.indexOf("major"));
            if (!isHighRank) return { valid: false, msg: "Mínimo exigido: Administrador/Major" };
            if (!isM3) return { valid: false, msg: "Falta M3 Aprovado" };
        }

        return { valid: true, msg: "REGULAR" };
    }
  
    function updateAnalyticsHUD() {
        let total = scannedUsersData.length; 
        let naoHabbo = 0;
        let naoRegistrados = 0; 
        let moderadores = 0;
        let irregulares = 0;
        const chatType = document.querySelector('input[name="chatType"]:checked').value;
  
        scannedUsersData.forEach(d => {
            if (!d.exists) naoHabbo++;
            
            const cargo = mapCargos[d.nick.toLowerCase()];
            const cursos = mapCursos[d.nick.toLowerCase()];
            
            if (!cargo) naoRegistrados++;
            
            if (d.exists && isModerator(d.motto)) moderadores++;

            // Avalia regra mesmo se o nick não existir no habbo, contando que exista no System
            if (cargo) {
                let check = checkRules(cargo, cursos, chatType);
                if (!check.valid) irregulares++;
            }
        });
        
        statMembros.textContent = total; 
        statNaoHabbo.textContent = naoHabbo;
        statNaoRegistrados.textContent = naoRegistrados; 
        statModeradores.textContent = moderadores; 
        statIrregulares.textContent = irregulares;
    }
  
    // ==========================================
    // RENDERIZAÇÃO E CARDS
    // ==========================================
    function createCard(data) {
        const card = document.createElement('div'); 
        card.className = 'target-card';
        
        const cargoDb = mapCargos[data.nick.toLowerCase()];
        const cursosDb = mapCursos[data.nick.toLowerCase()];
        const chatType = document.querySelector('input[name="chatType"]:checked').value;

        // Se não tiver no habbo, exibe avatar quebrado e muda a cor da tarja
        let avatarHtml = data.exists 
            ? `<img src="https://www.habbo.${data.domain}/habbo-imaging/avatarimage?user=${data.nick}&direction=2&head_direction=2&action=std&gesture=std&size=m&headonly=1" alt="avatar">` 
            : `<i class="fa-solid fa-user-slash" style="color:var(--text-muted); font-size: 20px; margin-top: 12px;"></i>`;
        
        if (!data.exists) card.style.borderLeftColor = "var(--status-warn)";

        // Status do Habbo
        let statusHabboText = data.exists ? `<span class="val-green">ATIVO</span>` : `<span class="val-red"><i class="fa-solid fa-triangle-exclamation"></i> NÃO CONSTA NO HABBO</span>`;
        let mottoText = data.exists ? data.motto : `<span class="val-gray">N/A</span>`;
        
        // Puxa o cargo do Firebase
        let cargoText = cargoDb ? `<span class="val-green">${cargoDb}</span>` : `<span class="val-red">NÃO REGISTRADO (SYSTEM)</span>`;
  
        // Avaliação de Regras
        let rules = checkRules(cargoDb, cursosDb, chatType);
        let ruleText = rules.valid ? `<span class="val-green"><i class="fa-solid fa-check"></i> ${rules.msg}</span>` : `<span class="val-red"><i class="fa-solid fa-xmark"></i> IRREGULAR: ${rules.msg}</span>`;
        if (!rules.valid) card.classList.add("error"); // Pinta de vermelho a borda

        // Verifica Moderação (Só se existir no Habbo, pois precisa da Missão atual)
        let modText = `<span class="val-gray">Membro Comum</span>`;
        if (data.exists && isModerator(data.motto)) {
            modText = `<span class="val-green"><i class="fa-solid fa-shield-halved"></i> MODERADOR AUTORIZADO</span>`;
        }
  
        let htmlContent = `
          <div class="card-header">
            <div class="avatar-box">${avatarHtml}</div>
            <div class="header-info">
                <h3>${data.nick}</h3>
                <p>${data.telegram}</p>
            </div>
          </div>
          <div class="card-body">
            <div class="data-row"><div class="data-label">HABBO:</div><div class="data-value">${statusHabboText}</div></div>
            <div class="data-row"><div class="data-label">CARGO/POSTO:</div><div class="data-value">${cargoText}</div></div>
            <div class="data-row"><div class="data-label">MISSÃO:</div><div class="data-value">${mottoText}</div></div>
            <div class="data-row"><div class="data-label">PERMISSÃO:</div><div class="data-value">${modText}</div></div>
            <div class="data-row" style="border-bottom: none; margin-top: 5px;"><div class="data-label">AVALIAÇÃO:</div><div class="data-value">${ruleText}</div></div>
          </div>
        `;
        
        card.innerHTML = htmlContent; 
        resultsGrid.appendChild(card); 
    }
  
    function updateFailuresUI() {
        failCountUI.textContent = failedNicks.length; failuresListUI.innerHTML = "";
        failedNicks.forEach(f => {
           const li = document.createElement('li');
           li.innerHTML = `<span>${f.nick}</span> <span><i class="fa-solid fa-triangle-exclamation"></i></span>`;
           failuresListUI.appendChild(li);
        });
    }
  
    failuresToggle.addEventListener('click', () => {
       if (failuresBody.style.display === 'none') {
           failuresBody.style.display = 'block';
           toggleIcon.classList.replace('fa-chevron-down', 'fa-chevron-up');
           if (failedNicks.length > 0 && !isRetrying) { startRetryProcess(); }
       } else {
           failuresBody.style.display = 'none';
           toggleIcon.classList.replace('fa-chevron-up', 'fa-chevron-down');
       }
    });
  
    async function startRetryProcess() {
        isRetrying = true; let count = 3;
        const countdown = setInterval(async () => {
            retryStatus.textContent = `Forçando comunicação em ${count}s...`; count--;
            if (count < 0) {
                clearInterval(countdown);
                retryStatus.textContent = "Re-processando falhas...";
                
                const nicksToRetry = [...failedNicks]; const domain = hotelSelect.value;
                failedNicks = []; 
                
                const CHUNK_SIZE = 5; 
                for (let i = 0; i < nicksToRetry.length; i += CHUNK_SIZE) {
                    const chunk = nicksToRetry.slice(i, i + CHUNK_SIZE);
                    
                    await Promise.all(chunk.map(async (user) => {
                        try {
                            const data = await fetchUserData(user.nick, user.telegram, domain);
                            scannedUsersData.push(data); 
                            
                            const cargoDb = mapCargos[data.nick.toLowerCase()];
                            if (data.exists || cargoDb) {
                                createCard(data);
                                resultCount.textContent = parseInt(resultCount.textContent) + 1;
                            } else {
                                // Realmente não existe nem no Habbo nem na Planilha
                                failedNicks.push(user);
                            }
                        } catch(e) {
                            failedNicks.push(user);
                        }
                    }));
                }
                
                updateFailuresUI();
                retryStatus.textContent = "Processamento finalizado.";
                isRetrying = false;
                updateAnalyticsHUD();
            }
        }, 1000);
    }
  
    btnSearch.addEventListener('click', async () => {
        const rawText = nickListInput.value; 
        const domain = hotelSelect.value;
        const lines = rawText.split('\n');
        let usersToScan = [];
  
        // Leitor de Regex Aperfeiçoado (Protege o "-War")
        for (let line of lines) {
            if (line.includes('•')) {
                let parts = line.split('•');
                let nickPart = parts[0].trim(); 
                
                // Se a linha COMEÇA EXATAMENTE com "- ", remove só o traço da lista
                if (nickPart.startsWith('- ')) {
                    nickPart = nickPart.substring(2).trim();
                }
                
                let tgPart = parts[1].trim();
                usersToScan.push({ nick: nickPart, telegram: tgPart });
            } else if (line.trim().length > 0 && !line.includes(':') && !line.startsWith('Olá') && !line.startsWith('=')) {
                usersToScan.push({ nick: line.trim(), telegram: 'N/A' });
            }
        }
        
        if (usersToScan.length === 0) { alert("Nenhum alvo válido encontrado. Verifique o formato (- Nick • @telegram)."); return; }
    
        // Reset Rápido
        resultsGrid.innerHTML = ""; scannedUsersData = []; failedNicks = []; updateFailuresUI(); resultCount.textContent = "0"; analyticsPanel.style.display = "none";
        btnSearch.disabled = true; failuresBody.style.display = 'none'; toggleIcon.classList.replace('fa-chevron-up', 'fa-chevron-down'); retryStatus.textContent = "";
        
        scanStatus.textContent = "Sincronizando Dados (Firebase)..."; 
        await fetchDatabase(); 
        
        const CHUNK_SIZE = 15; 
        const totalChunks = Math.ceil(usersToScan.length / CHUNK_SIZE); 
    
        for (let i = 0; i < usersToScan.length; i += CHUNK_SIZE) {
            const chunk = usersToScan.slice(i, i + CHUNK_SIZE); 
            scanStatus.textContent = `Conferindo Lista: Lote ${Math.floor(i / CHUNK_SIZE) + 1} de ${totalChunks}...`; 
            
            await Promise.all(chunk.map(async (user) => {
                try { 
                    const data = await fetchUserData(user.nick, user.telegram, domain); 
                    scannedUsersData.push(data); 
                    
                    const cargoDb = mapCargos[data.nick.toLowerCase()];
                    
                    // Condição de sucesso: Existir no Habbo OU Exisitir no System (Planilha)
                    if (data.exists || cargoDb) {
                        createCard(data);
                        resultCount.textContent = parseInt(resultCount.textContent) + 1; 
                    } else {
                        failedNicks.push(user);
                    }
                } catch(e) { failedNicks.push(user); }
            }));
        }
    
        scanStatus.textContent = "Conferência concluída com sucesso."; 
        updateAnalyticsHUD(); 
        updateFailuresUI();
        analyticsPanel.style.display = "flex"; 
        btnSearch.disabled = false;
    });
});