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
    const statNaoRegistrados = document.getElementById('statNaoRegistrados');
    const statModeradores = document.getElementById('statModeradores');
  
    let failedNicks = [];
    let scannedUsersData = [];
    let isRetrying = false;
    let mapCargos = {}; // Armazena os dados do Firebase

    // ==========================================
    // SINCRONIZAÇÃO COM FIREBASE (CARGOS) OVERDRIVE
    // ==========================================
    async function fetchCargosFirebase() {
        const apiKey = "AIzaSyBcA6jZ4Uxul6e1JkDvW02MW4TqbQONWxk";
        const projectId = "overdrive-7f853";
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/configuracoes/cargos?key=${apiKey}`;

        try {
            const res = await fetch(url);
            const json = await res.json();
            if (json.fields && json.fields.dados && json.fields.dados.stringValue) {
                const rawData = JSON.parse(json.fields.dados.stringValue);
                mapCargos = {};
                for (let key in rawData) {
                    mapCargos[key.trim().toLowerCase()] = rawData[key].trim();
                }
            }
        } catch (e) {
            console.error("Falha ao baixar cargos do Firebase:", e);
        }
    }

    // ==========================================
    // LÓGICA DE API E BUSCA HABBO
    // ==========================================
    const PROXIES = [ 
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`, 
        (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, 
        (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` 
    ];
    
    async function fetchWithProxy(targetUrl) { 
        for (const getProxyUrl of PROXIES) { 
            try { 
                const res = await fetch(getProxyUrl(targetUrl)); 
                const text = await res.text(); 
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
        
        return { 
            exists: true, 
            nick: baseData.name || nick, 
            telegram: telegram,
            motto: baseData.motto || "Sem missão", 
            domain: domain 
        };
    }
  
    // ==========================================
    // VERIFICAÇÃO DE MODERAÇÃO
    // ==========================================
    function isModerator(motto) {
        const chatType = document.querySelector('input[name="chatType"]:checked').value;
        const upperMotto = motto.toUpperCase();
        let acronyms = [];

        if (chatType === 'oficiais') {
            acronyms = ['C.AP', 'S.AP', 'CC.AP', 'S.SP', 'VL.SP', 'L.SP'];
        } else {
            acronyms = ['CC.AP', 'S.AP', 'C.AP'];
        }

        return acronyms.some(acronym => upperMotto.includes(acronym));
    }

    function updateAnalyticsHUD() {
        let total = scannedUsersData.length; 
        let naoRegistrados = 0; 
        let moderadores = 0;

        scannedUsersData.forEach(d => {
            if (d.exists) {
                const cargo = mapCargos[d.nick.toLowerCase()];
                if (!cargo) naoRegistrados++;
                if (isModerator(d.motto)) moderadores++;
            }
        });
        
        statMembros.textContent = total; 
        statNaoRegistrados.textContent = naoRegistrados; 
        statModeradores.textContent = moderadores; 
    }
  
    function createSuccessCard(data) {
        const card = document.createElement('div'); 
        card.className = 'target-card';
        
        // Puxa o cargo do Firebase
        const cargoDb = mapCargos[data.nick.toLowerCase()];
        let cargoText = cargoDb ? `<span class="val-green">${cargoDb}</span>` : `<span class="val-red">NÃO REGISTRADO (SYSTEM)</span>`;
  
        // Verifica Moderação
        const isMod = isModerator(data.motto);
        let modText = isMod 
            ? `<span class="val-green"><i class="fa-solid fa-shield-halved"></i> MODERADOR AUTORIZADO</span>` 
            : `<span class="val-gray">Membro Comum</span>`;

        let htmlContent = `
          <div class="card-header">
            <div class="avatar-box"><img src="https://www.habbo.${data.domain}/habbo-imaging/avatarimage?user=${data.nick}&direction=2&head_direction=2&action=std&gesture=std&size=m&headonly=1" alt="avatar"></div>
            <div class="header-info">
                <h3>${data.nick}</h3>
                <p>${data.telegram}</p>
            </div>
          </div>
          <div class="card-body">
            <div class="data-row"><div class="data-label">CARGO/POSTO:</div><div class="data-value">${cargoText}</div></div>
            <div class="data-row"><div class="data-label">MISSÃO:</div><div class="data-value">${data.motto}</div></div>
            <div class="data-row"><div class="data-label">PERMISSÃO:</div><div class="data-value">${modText}</div></div>
          </div>
        `;
        
        card.innerHTML = htmlContent; 
        resultsGrid.appendChild(card); 
    }
  
    function createErrorCard(nick, telegram) {
        const card = document.createElement('div'); card.className = 'target-card error';
        card.innerHTML = `
        <div class="card-header">
            <div class="avatar-box"><i class="fa-solid fa-xmark" style="color:#ff003c; margin-top:15px;"></i></div>
            <div class="header-info"><h3>${nick}</h3><p>${telegram}</p></div>
        </div>
        <div class="card-body">
            <div class="data-row"><div class="data-label">STATUS:</div><div class="data-value"><span class="val-red">USUÁRIO INEXISTENTE NO HABBO</span></div></div>
        </div>`;
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
                retryStatus.textContent = "Re-processando alvos perdidos...";
                
                const nicksToRetry = [...failedNicks]; const domain = hotelSelect.value;
                failedNicks = []; 
                
                const CHUNK_SIZE = 5; 
                for (let i = 0; i < nicksToRetry.length; i += CHUNK_SIZE) {
                    const chunk = nicksToRetry.slice(i, i + CHUNK_SIZE);
                    
                    await Promise.all(chunk.map(async (user) => {
                        try {
                            const data = await fetchUserData(user.nick, user.telegram, domain);
                            scannedUsersData.push(data); 
                            if (data.exists) createSuccessCard(data); else createErrorCard(data.nick, data.telegram);
                            resultCount.textContent = parseInt(resultCount.textContent) + 1;
                        } catch(e) {
                            failedNicks.push(user);
                        }
                    }));
                    await new Promise(r => setTimeout(r, 500));
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

        // Separador Regex para o Telegram (- Nick • @telegram)
        for (let line of lines) {
            if (line.includes('•')) {
                let parts = line.split('•');
                let nickPart = parts[0].replace(/^[- \t]+/, '').trim(); 
                let tgPart = parts[1].trim();
                usersToScan.push({ nick: nickPart, telegram: tgPart });
            } else if (line.trim().length > 0 && !line.includes(':') && !line.startsWith('Olá') && !line.startsWith('=')) {
                usersToScan.push({ nick: line.trim(), telegram: 'N/A' });
            }
        }
        
        if (usersToScan.length === 0) { alert("Nenhum alvo válido encontrado. Verifique o formato (- Nick • @telegram)."); return; }
    
        resultsGrid.innerHTML = ""; scannedUsersData = []; failedNicks = []; updateFailuresUI(); resultCount.textContent = "0"; analyticsPanel.style.display = "none";
        btnSearch.disabled = true; failuresBody.style.display = 'none'; toggleIcon.classList.replace('fa-chevron-up', 'fa-chevron-down'); retryStatus.textContent = "";
        
        scanStatus.textContent = "Sincronizando Cargos (Firebase)..."; 
        await fetchCargosFirebase(); 
        
        const CHUNK_SIZE = 5; 
        const totalChunks = Math.ceil(usersToScan.length / CHUNK_SIZE); 
    
        for (let i = 0; i < usersToScan.length; i += CHUNK_SIZE) {
            const chunk = usersToScan.slice(i, i + CHUNK_SIZE); 
            scanStatus.textContent = `Conferindo Lista: Lote ${Math.floor(i / CHUNK_SIZE) + 1} de ${totalChunks}...`; 
            
            await Promise.all(chunk.map(async (user) => {
                try { 
                    const data = await fetchUserData(user.nick, user.telegram, domain); 
                    scannedUsersData.push(data); 
                    
                    if (data.exists) createSuccessCard(data); 
                    else createErrorCard(data.nick, data.telegram); 
                    
                    resultCount.textContent = parseInt(resultCount.textContent) + 1; 
                } catch(e) { failedNicks.push(user); }
            }));
    
            const cards = resultsGrid.querySelectorAll('.target-card'); 
            if (cards.length > 0) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
            
            await new Promise(r => setTimeout(r, 600)); 
        }
    
        scanStatus.textContent = "Conferência concluída com sucesso."; 
        updateAnalyticsHUD(); 
        updateFailuresUI();
        analyticsPanel.style.display = "flex"; 
        btnSearch.disabled = false;
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
    });
});