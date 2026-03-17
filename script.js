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
    
    let mapCargos = {}; 
    let mapCursos = {};

    // Hierarquias Corrigidas
    const hierarquiaMilitar = [
        "cabo", "sargento", "subtenente", "aspirante", "tenente", "capitão",
        "major", "tenente-coronel", "coronel", "inspetor", "superintendente",
        "comandante", "comandante-geral", "supremo", "vice-presidente", "presidente"
    ];

    const hierarquiaExecutiva = [
        "sócio", "agente", "analista", "coordenador", "promotor", "advogado",
        "administrador", "delegado", "investigador", "detetive", "supervisor",
        "líder", "líder-executivo", "chanceler"
    ];
  
    // ==========================================
    // FIREBASE OVERDRIVE
    // ==========================================
    async function fetchDatabase() {
        const apiKey = "AIzaSyBcA6jZ4Uxul6e1JkDvW02MW4TqbQONWxk";
        const projectId = "overdrive-7f853";
        const urlCargos = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/configuracoes/cargos?key=${apiKey}`;
        const urlCursos = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/configuracoes/cursos?key=${apiKey}`;
  
        try {
            const res = await fetch(urlCargos);
            const json = await res.json();
            if (json.fields && json.fields.dados && json.fields.dados.stringValue) {
                const rawData = JSON.parse(json.fields.dados.stringValue);
                mapCargos = {};
                for (let key in rawData) mapCargos[key.trim().toLowerCase()] = rawData[key].trim();
            }
        } catch (e) { console.error("Falha ao baixar cargos:", e); }

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
    // API PROXIES OTIMIZADOS
    // ==========================================
    const PROXIES = [ 
        { url: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'json' },
        { url: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'raw' }
    ];
    
    // Timeout para evitar que a fila fique presa caso o Habbo demore
    async function fetchWithTimeout(resource, options = {}) {
        const { timeout = 5000 } = options;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    }

    async function fetchWithProxy(targetUrl) { 
        for (const proxy of PROXIES) { 
            try { 
                const res = await fetchWithTimeout(proxy.url(targetUrl)); 
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
    // REGRAS DE NEGÓCIO E HIERARQUIA
    // ==========================================
    function isModerator(motto) {
        if(!motto) return false;
        const chatType = document.querySelector('input[name="chatType"]:checked').value;
        const upperMotto = motto.toUpperCase();
        
        const globalRoles = ['INSPETOR', 'SUPERINTENDENTE', 'COMANDANTE', 'SUPREMO', 'PRESIDENTE', 'VICE-PRESIDENTE', 'PRESIDÊNCIA'];
        const isGlobalAdmin = globalRoles.some(role => upperMotto.includes(role));
        const isGoe = /\d/.test(upperMotto) && upperMotto.includes('ª');
  
        if (isGlobalAdmin || isGoe) return true;
  
        let acronyms = (chatType === 'oficiais' || chatType === 'superiores') ? ['C.AP', 'S.AP', 'CC.AP', 'S.SP', 'VL.SP', 'L.SP'] : ['CC.AP', 'S.AP', 'C.AP'];
        return acronyms.some(acronym => upperMotto.includes(acronym));
    }

    function getTrainingLevel(cursosDb, motto, cargoLower) {
        let level = 0; // 1=CFO, 2=M1, 3=M2, 4=M3, 5=CFS
        
        // 1. Puxa do Banco de Dados
        if (cursosDb) {
            if (cursosDb.m1 && cursosDb.m1.toLowerCase() === "aprovado") level = Math.max(level, 2);
            if (cursosDb.m3 && cursosDb.m3.toLowerCase() === "aprovado") level = Math.max(level, 4);
        }

        // 2. Puxa pela Missão no Habbo (se o cara tiver lá)
        if (motto) {
            let m = motto.toUpperCase();
            if (m.includes("CFO")) level = Math.max(level, 1);
            if (/\bM1\b/.test(m) || m.includes("[M1]")) level = Math.max(level, 2);
            if (/\bM2\b/.test(m) || m.includes("[M2]")) level = Math.max(level, 3);
            if (/\bM3\b/.test(m) || m.includes("[M3]")) level = Math.max(level, 4);
            if (/\bCFS\b/.test(m) || m.includes("[CFS]")) level = Math.max(level, 5); // CFS cobre todos os anteriores
        }

        // 3. Regra Tenente-Coronel+: Se for patente alta, já tem tudo (M1 e M3 garantidos)
        let idxMil = hierarquiaMilitar.indexOf(cargoLower);
        if (idxMil >= hierarquiaMilitar.indexOf("tenente-coronel")) {
            level = Math.max(level, 5);
        }

        return level;
    }

    function checkRules(cargoDb, trainingLevel, chatType) {
        if (!cargoDb) return { valid: false, msg: "Faltam Dados no System" };

        let cargoLower = cargoDb.toLowerCase();
        let idxExec = hierarquiaExecutiva.indexOf(cargoLower);
        let idxMil = hierarquiaMilitar.indexOf(cargoLower);

        let isExecutivo = idxExec !== -1;
        let isMilitar = idxMil !== -1;

        if (!isExecutivo && !isMilitar) return { valid: true, msg: "REGULAR (Outro Cargo/Convidado)" }; 

        if (chatType === "oficiais") {
            if (isExecutivo) {
                if (idxExec < hierarquiaExecutiva.indexOf("promotor")) return { valid: false, msg: "Mínimo: Promotor" };
                if (trainingLevel < 2) return { valid: false, msg: "Falta M1 Aprovado" };
            } else if (isMilitar) {
                if (idxMil < hierarquiaMilitar.indexOf("tenente")) return { valid: false, msg: "Mínimo: Tenente" };
            }
        } 
        else if (chatType === "superiores") {
            if (isExecutivo) {
                if (idxExec < hierarquiaExecutiva.indexOf("administrador")) return { valid: false, msg: "Mínimo: Administrador" };
                if (trainingLevel < 4) return { valid: false, msg: "Falta M3 Aprovado" };
            } else if (isMilitar) {
                if (idxMil < hierarquiaMilitar.indexOf("major")) return { valid: false, msg: "Mínimo: Major" };
            }
        } 
        else if (chatType === "pv") {
            if (isExecutivo) {
                if (idxExec < hierarquiaExecutiva.indexOf("administrador")) return { valid: false, msg: "Mínimo: Administrador" };
                if (trainingLevel < 4) return { valid: false, msg: "Falta M3 Aprovado" };
            } else if (isMilitar) {
                if (idxMil < hierarquiaMilitar.indexOf("major")) return { valid: false, msg: "Mínimo: Major" };
                if (trainingLevel < 4) return { valid: false, msg: "Falta M3 Aprovado" };
            }
        }
        return { valid: true, msg: "REGULAR" };
    }
  
    function updateAnalyticsHUD() {
        let total = scannedUsersData.length; 
        let naoHabbo = 0; let naoRegistrados = 0; let moderadores = 0; let irregulares = 0;
        const chatType = document.querySelector('input[name="chatType"]:checked').value;
  
        scannedUsersData.forEach(d => {
            if (!d.exists) naoHabbo++;
            
            const cargo = mapCargos[d.nick.toLowerCase()];
            const cursos = mapCursos[d.nick.toLowerCase()];
            
            if (!cargo) naoRegistrados++;
            if (d.exists && isModerator(d.motto)) moderadores++;

            if (cargo) {
                let tLevel = getTrainingLevel(cursos, d.exists ? d.motto : "", cargo.toLowerCase());
                let check = checkRules(cargo, tLevel, chatType);
                if (!check.valid) irregulares++;
            }
        });
        
        statMembros.textContent = total; statNaoHabbo.textContent = naoHabbo;
        statNaoRegistrados.textContent = naoRegistrados; statModeradores.textContent = moderadores; 
        statIrregulares.textContent = irregulares;
    }
  
    // ==========================================
    // CRIAÇÃO DOS CARDS
    // ==========================================
    function createCard(data) {
        const card = document.createElement('div'); card.className = 'target-card';
        const cargoDb = mapCargos[data.nick.toLowerCase()];
        const cursosDb = mapCursos[data.nick.toLowerCase()];
        const chatType = document.querySelector('input[name="chatType"]:checked').value;

        let avatarHtml = data.exists 
            ? `<img src="https://www.habbo.${data.domain}/habbo-imaging/avatarimage?user=${data.nick}&direction=2&head_direction=2&action=std&gesture=std&size=m&headonly=1" alt="avatar">` 
            : `<i class="fa-solid fa-user-slash" style="color:var(--text-muted); font-size: 20px; margin-top: 12px;"></i>`;
        
        if (!data.exists) card.style.borderLeftColor = "var(--status-warn)";

        let statusHabboText = data.exists ? `<span class="val-green">ATIVO</span>` : `<span class="val-red">NÃO CONSTA NO HABBO</span>`;
        let mottoText = data.exists ? data.motto : `<span class="val-gray">N/A</span>`;
        let cargoText = cargoDb ? `<span class="val-green">${cargoDb}</span>` : `<span class="val-red">NÃO REGISTRADO (SYSTEM)</span>`;
  
        let tLevel = getTrainingLevel(cursosDb, data.exists ? data.motto : "", cargoDb ? cargoDb.toLowerCase() : "");
        let rules = checkRules(cargoDb, tLevel, chatType);
        let ruleText = rules.valid ? `<span class="val-green"><i class="fa-solid fa-check"></i> ${rules.msg}</span>` : `<span class="val-red"><i class="fa-solid fa-xmark"></i> IRREGULAR: ${rules.msg}</span>`;
        if (!rules.valid) card.classList.add("error"); 

        let modText = `<span class="val-gray">Membro Comum</span>`;
        if (data.exists && isModerator(data.motto)) modText = `<span class="val-green"><i class="fa-solid fa-shield-halved"></i> MODERADOR AUTORIZADO</span>`;
  
        let htmlContent = `
          <div class="card-header"><div class="avatar-box">${avatarHtml}</div><div class="header-info"><h3>${data.nick}</h3><p>${data.telegram}</p></div></div>
          <div class="card-body">
            <div class="data-row"><div class="data-label">HABBO:</div><div class="data-value">${statusHabboText}</div></div>
            <div class="data-row"><div class="data-label">CARGO/POSTO:</div><div class="data-value">${cargoText}</div></div>
            <div class="data-row"><div class="data-label">MISSÃO:</div><div class="data-value">${mottoText}</div></div>
            <div class="data-row"><div class="data-label">PERMISSÃO:</div><div class="data-value">${modText}</div></div>
            <div class="data-row" style="border-bottom: none; margin-top: 5px;"><div class="data-label">AVALIAÇÃO:</div><div class="data-value">${ruleText}</div></div>
          </div>
        `;
        card.innerHTML = htmlContent; resultsGrid.appendChild(card); 
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
           failuresBody.style.display = 'block'; toggleIcon.classList.replace('fa-chevron-down', 'fa-chevron-up');
           if (failedNicks.length > 0 && !isRetrying) { startRetryProcess(); }
       } else {
           failuresBody.style.display = 'none'; toggleIcon.classList.replace('fa-chevron-up', 'fa-chevron-down');
       }
    });
  
    async function startRetryProcess() {
        isRetrying = true; let count = 3;
        const countdown = setInterval(async () => {
            retryStatus.textContent = `Forçando comunicação em ${count}s...`; count--;
            if (count < 0) {
                clearInterval(countdown); retryStatus.textContent = "Re-processando falhas...";
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
                                createCard(data); resultCount.textContent = parseInt(resultCount.textContent) + 1;
                            } else failedNicks.push(user);
                        } catch(e) { failedNicks.push(user); }
                    }));
                }
                updateFailuresUI(); retryStatus.textContent = "Processamento finalizado."; isRetrying = false; updateAnalyticsHUD();
            }
        }, 1000);
    }
  
    btnSearch.addEventListener('click', async () => {
        const rawText = nickListInput.value; 
        const domain = hotelSelect.value;
        const lines = rawText.split('\n');
        let usersToScan = [];
  
        for (let line of lines) {
            if (line.includes('•')) {
                let parts = line.split('•');
                let nickPart = parts[0].trim(); 
                if (nickPart.startsWith('- ')) {
                    nickPart = nickPart.substring(2).trim();
                }
                let tgPart = parts[1].trim();
                usersToScan.push({ nick: nickPart, telegram: tgPart });
            } else if (line.trim().length > 0 && !line.includes(':') && !line.startsWith('Olá') && !line.startsWith('=')) {
                usersToScan.push({ nick: line.trim(), telegram: 'N/A' });
            }
        }
        
        if (usersToScan.length === 0) { alert("Nenhum alvo válido encontrado. Verifique o formato."); return; }
    
        resultsGrid.innerHTML = ""; scannedUsersData = []; failedNicks = []; updateFailuresUI(); resultCount.textContent = "0"; analyticsPanel.style.display = "none";
        btnSearch.disabled = true; failuresBody.style.display = 'none'; toggleIcon.classList.replace('fa-chevron-up', 'fa-chevron-down'); retryStatus.textContent = "";
        
        scanStatus.textContent = "Sincronizando Dados (Firebase)..."; 
        await fetchDatabase(); 
        
        const CHUNK_SIZE = 10; 
        const totalChunks = Math.ceil(usersToScan.length / CHUNK_SIZE); 
    
        for (let i = 0; i < usersToScan.length; i += CHUNK_SIZE) {
            const chunk = usersToScan.slice(i, i + CHUNK_SIZE); 
            scanStatus.textContent = `Conferindo Lista: Lote ${Math.floor(i / CHUNK_SIZE) + 1} de ${totalChunks}...`; 
            
            await Promise.all(chunk.map(async (user) => {
                try { 
                    const data = await fetchUserData(user.nick, user.telegram, domain); 
                    scannedUsersData.push(data); 
                    const cargoDb = mapCargos[data.nick.toLowerCase()];
                    
                    if (data.exists || cargoDb) {
                        createCard(data); resultCount.textContent = parseInt(resultCount.textContent) + 1; 
                    } else failedNicks.push(user);
                } catch(e) { failedNicks.push(user); }
            }));
            
            // Pausa sutil entre lotes para não engasgar o navegador. Não empurra mais a tela pra baixo.
            await new Promise(r => setTimeout(r, 200)); 
        }
    
        scanStatus.textContent = "Conferência concluída com sucesso."; 
        updateAnalyticsHUD(); 
        updateFailuresUI();
        analyticsPanel.style.display = "flex"; 
        btnSearch.disabled = false;
    });
});