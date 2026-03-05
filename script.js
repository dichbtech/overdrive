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
  
    const chkAllGroups = document.getElementById('chkAllGroups');
    const chkOtherPolice = document.getElementById('chkOtherPolice'); 
    const chkOffline = document.getElementById('chkOffline');
    const chkHidden = document.getElementById('chkHidden');
    const btnApplyFilters = document.getElementById('btnApplyFilters');
    const btnClearFilters = document.getElementById('btnClearFilters');
    
    const analyticsPanel = document.getElementById('analyticsPanel');
    const statOnline = document.getElementById('statOnline');
    const statRisco = document.getElementById('statRisco');
    const statBaixas = document.getElementById('statBaixas');
  
    // Controle da IA
    const aiOverlay = document.getElementById('aiOverlay');
    let hasWelcomed = false;
    let iaIsSpeaking = false;
    let isOverlayActive = false;
  
    let failedNicks = [];
    let scannedUsersData = [];
    let isRetrying = false;
  
    // ==========================================
    // SISTEMA DE VOZ DA IA (FORTE E FEMININA)
    // ==========================================
    let synthVoices = [];
    function populateVoices() { synthVoices = window.speechSynthesis.getVoices().filter(v => v.lang.includes('pt')); }
    if (window.speechSynthesis.onvoiceschanged !== undefined) window.speechSynthesis.onvoiceschanged = populateVoices;
    populateVoices();
  
    function speakText(text, onStartCallback, onEndCallback) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); 
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'pt-BR';
            utterance.pitch = 1.5; // Feminina robótica
            utterance.rate = 1.25; // Implacável
  
            if (synthVoices.length === 0) populateVoices();
            const femaleVoice = synthVoices.find(v => v.name.includes('Francisca') || v.name.includes('Luciana') || v.name.includes('Google português do Brasil') || v.name.includes('Zira') || v.name.includes('Vitoria') || v.name.includes('Helena'));
            if (femaleVoice) { utterance.voice = femaleVoice; } 
            else if (synthVoices.length > 0) { utterance.voice = synthVoices.find(v => !v.name.includes('Daniel') && !v.name.includes('Thiago')) || synthVoices[0]; }
  
            utterance.onstart = () => { iaIsSpeaking = true; if(onStartCallback) onStartCallback(); };
            utterance.onend = () => { iaIsSpeaking = false; if(onEndCallback) onEndCallback(); };
            window.speechSynthesis.speak(utterance);
        } else {
            if (onStartCallback) onStartCallback();
            setTimeout(() => { if (onEndCallback) onEndCallback(); }, 3000);
        }
    }
  
    document.body.addEventListener('click', () => {
        if (!hasWelcomed) { 
            speakText("Bem-vindo, policial, ao sistema intel tracker.", null, null); 
            hasWelcomed = true; 
        }
    }, { once: true });
  
    // ==========================================
    // LÓGICA DE BUSCA HABBO E RENDERIZAÇÃO
    // ==========================================
    const POLICE_REGEX = /\b(RCC|GOPH|ONU|DIC|DSP|PMHH|Ex\.Br|DPH|CSI|MB|FAB|EH|PMH|DPG|PH|PMR|DPP|CAP|GOC|UNP|FMB|POL[ÍI]CIA|MILITAR|EX[ÉI]RCITO|DEPARTAMENTO|FOR[ÇC]AS|BOPE|SWAT|FBI)\b|ÐIC/i;
    const DIC_REGEX = /(DIC|ÐIC|Departamento de Investiga[çc][ãa]o Criminal)/i;
    function isPoliceGroup(groupName) { return POLICE_REGEX.test(groupName); }
    function isDICGroup(groupName) { return DIC_REGEX.test(groupName); }
  
    const PROXIES = [
      (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];
  
    async function fetchWithProxy(targetUrl) {
      for (const getProxyUrl of PROXIES) {
        try { const res = await fetch(getProxyUrl(targetUrl)); const text = await res.text();
          try { const data = JSON.parse(text); if (data && (data.uniqueId || data.error === "not-found" || data.user || Array.isArray(data.groups))) return data; } catch(e) {}
        } catch (e) {}
      } throw new Error("Proxy falhou");
    }
  
    function formatDate(isoString) { if (!isoString) return "Desconhecido"; const date = new Date(isoString); return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  
    async function fetchUserData(nick, domain) {
      const targetUrl = `https://www.habbo.${domain}/api/public/users?name=${encodeURIComponent(nick)}`;
      const baseData = await fetchWithProxy(targetUrl);
      if (baseData.error === "not-found" || (baseData.name && baseData.name.toLowerCase() !== nick.toLowerCase())) return { exists: false, nick: nick };
      const uniqueId = baseData.uniqueId; let profileVisible = baseData.profileVisible; if (baseData.lastAccessTime) profileVisible = true;
      let allGroups = []; let policeGroups = []; let otherPoliceGroups = []; 
      if (profileVisible && uniqueId) {
          try { const profData = await fetchWithProxy(`https://www.habbo.${domain}/api/public/users/${uniqueId}/profile`);
              if (profData.groups && Array.isArray(profData.groups)) { allGroups = profData.groups; policeGroups = profData.groups.filter(g => isPoliceGroup(g.name)); otherPoliceGroups = policeGroups.filter(g => !isDICGroup(g.name)); }
          } catch(e) {}
      }
      return { exists: true, nick: baseData.name || nick, motto: baseData.motto || "Sem missão", profileVisible: profileVisible, isOnline: baseData.online, lastAccessTime: baseData.lastAccessTime, allGroups: allGroups, policeGroups: policeGroups, otherPoliceGroups: otherPoliceGroups, domain: domain };
    }
  
    function shouldRenderUser(data) {
       if (!data.exists) return !chkOffline.checked && !chkHidden.checked && !chkOtherPolice.checked;
       const isOfflineMode = !data.isOnline && !data.lastAccessTime;
       if (chkOffline.checked && !isOfflineMode) return false;
       if (chkHidden.checked && data.profileVisible) return false;
       if (chkOtherPolice.checked && data.otherPoliceGroups.length === 0) return false;
       return true;
    }
  
    function updateAnalyticsHUD() {
      let online = 0; let riscos = 0; let baixas = failedNicks.length;
      scannedUsersData.forEach(d => {
          if(!d.exists) { baixas++; return; }
          if(d.isOnline) online++; let hasRisk = false;
          if (!d.profileVisible || (d.profileVisible && !d.isOnline && !d.lastAccessTime) || d.otherPoliceGroups.length > 0) hasRisk = true;
          if (d.profileVisible && d.policeGroups.filter(g => isDICGroup(g.name)).length === 0) hasRisk = true;
          if (d.lastAccessTime && Math.floor((new Date() - new Date(d.lastAccessTime)) / (1000 * 60 * 60 * 24)) >= 7) hasRisk = true;
          if(hasRisk) riscos++;
      });
      statOnline.textContent = online; statRisco.textContent = riscos; statBaixas.textContent = baixas; return riscos; 
    }
  
    function renderAllCards() {
       resultsGrid.innerHTML = ""; let count = 0;
       scannedUsersData.forEach(data => { if (shouldRenderUser(data)) { if (data.exists) createSuccessCard(data); else createErrorCard(data.nick, data.realFailure); count++; } });
       resultCount.textContent = count;
    }
  
    function createSuccessCard(data) {
      const card = document.createElement('div'); card.className = 'target-card';
      const visibText = data.profileVisible ? '<span class="val-green">ATIVADA (ABERTO)</span>' : '<span class="val-red">DESATIVADA (OCULTO)</span>';
      let onlineText = data.isOnline ? '<span class="val-green">🟢 ONLINE</span>' : (!data.lastAccessTime ? '<span class="val-gray">Modo Offline (Oculto)</span>' : `<span class="val-gray">Último acesso: ${formatDate(data.lastAccessTime)}</span>`);
      let groupsToUse = chkAllGroups.checked ? data.allGroups : (chkOtherPolice.checked ? data.otherPoliceGroups : data.policeGroups);
      let groupTitle = chkAllGroups.checked ? "TODOS OS GRUPOS" : (chkOtherPolice.checked ? "OUTRAS POLÍCIAS" : "ORG. POLICIAIS");
      let htmlContent = `<div class="card-header"><div class="avatar-box"><img src="https://www.habbo.${data.domain}/habbo-imaging/avatarimage?user=${data.nick}&direction=2&head_direction=2&action=std&gesture=std&size=m&headonly=1" alt="avatar"></div><div class="header-info"><h3>${data.nick}</h3><p>MISSÃO: ${data.motto}</p></div></div><div class="card-body"><div class="data-row"><div class="data-label">PERFIL:</div><div class="data-value">${visibText}</div></div><div class="data-row"><div class="data-label">STATUS:</div><div class="data-value">${onlineText}</div></div><div class="groups-container"><div class="groups-title">${groupTitle} (${groupsToUse.length})</div>`;
      if (!data.profileVisible) htmlContent += `<div class="group-item"><span class="group-name val-red">Acesso negado: Perfil Privado.</span></div>`; else if (groupsToUse.length === 0) htmlContent += `<div class="group-item"><span class="group-name val-gray">Nenhum grupo encontrado nesta categoria.</span></div>`; else groupsToUse.forEach(g => { htmlContent += `<div class="group-item"><img src="https://www.habbo.${data.domain}/habbo-imaging/badge/${g.badgeCode}.gif" onerror="this.style.display='none'"><div class="group-details"><span class="group-name">${g.name}</span></div></div>`; });
      htmlContent += `</div></div>`; card.innerHTML = htmlContent; resultsGrid.appendChild(card);
    }
  
    function createErrorCard(nick, isConnectionFail = false) {
      const card = document.createElement('div'); card.className = 'target-card error';
      card.innerHTML = `<div class="card-header"><div class="avatar-box"><i class="fa-solid fa-xmark" style="color:#ff4444; margin-top:15px;"></i></div><div class="header-info"><h3>${nick}</h3><p class="val-red">${isConnectionFail ? "FALHA DE CONEXÃO" : "USUÁRIO INEXISTENTE"}</p></div></div>`;
      resultsGrid.appendChild(card);
    }
  
    function updateFailuresUI() { failCountUI.textContent = failedNicks.length; failuresListUI.innerHTML = ""; failedNicks.forEach(nick => { const li = document.createElement('li'); li.innerHTML = `<span>${nick}</span> <span><i class="fa-solid fa-triangle-exclamation"></i></span>`; failuresListUI.appendChild(li); }); }
    function addFailedNick(nick) { if(!failedNicks.includes(nick)) { failedNicks.push(nick); updateFailuresUI(); } }
    function removeFailedNick(nick) { failedNicks = failedNicks.filter(n => n !== nick); updateFailuresUI(); }
  
    btnApplyFilters.addEventListener('click', () => { renderAllCards(); });
    btnClearFilters.addEventListener('click', () => { chkAllGroups.checked = false; chkOtherPolice.checked = false; chkOffline.checked = false; chkHidden.checked = false; renderAllCards(); });
  
    btnSearch.addEventListener('click', async () => {
      const rawText = nickListInput.value; const domain = hotelSelect.value;
      const nicks = [...new Set(rawText.split('\n').map(n => n.trim()).filter(n => n.length > 0))];
      if (nicks.length === 0) { alert("Insira pelo menos um nick."); return; }
  
      resultsGrid.innerHTML = ""; scannedUsersData = []; failedNicks = []; updateFailuresUI(); resultCount.textContent = "0"; analyticsPanel.style.display = "none";
      btnSearch.disabled = true; failuresBody.style.display = 'none'; toggleIcon.classList.replace('fa-chevron-up', 'fa-chevron-down'); retryStatus.textContent = "";
      
      const CHUNK_SIZE = 10; const totalChunks = Math.ceil(nicks.length / CHUNK_SIZE);
      for (let i = 0; i < nicks.length; i += CHUNK_SIZE) {
          const chunk = nicks.slice(i, i + CHUNK_SIZE); scanStatus.textContent = `Varredura rápida: Lote ${Math.floor(i / CHUNK_SIZE) + 1} de ${totalChunks}...`;
          await Promise.all(chunk.map(async (nick) => {
              try { const data = await fetchUserData(nick, domain); scannedUsersData.push(data); if (shouldRenderUser(data)) { if (data.exists) createSuccessCard(data); else createErrorCard(data.nick); resultCount.textContent = parseInt(resultCount.textContent) + 1; } } catch(e) { addFailedNick(nick); }
          }));
          await new Promise(r => setTimeout(r, 250));
      }
  
      scanStatus.textContent = "Varredura principal concluída."; 
      const totalRiscos = updateAnalyticsHUD(); analyticsPanel.style.display = "flex"; btnSearch.disabled = false;
  
      // ===============================================
      // A MÁGICA: O VÍDEO DA IA APARECE NA TELA
      // ===============================================
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      if (aiOverlay) {
          setTimeout(() => {
              aiOverlay.classList.add('active'); // O fundo fica preto
              isOverlayActive = true;
              
              setTimeout(() => {
                  let msg = totalRiscos > 0 ? `Atenção. Varredura finalizada. Uma ameaça foi identificada. Foram encontradas ${totalRiscos} transgressões no sistema.` : "Varredura finalizada. Nenhuma transgressão foi encontrada no sistema.";
                  
                  speakText(msg, null, () => { 
                      setTimeout(() => { 
                          aiOverlay.classList.remove('active'); // SOME QUANDO PARA DE FALAR
                          isOverlayActive = false;
                      }, 1000); 
                  });
              }, 1000); // 1 segundo pra admirar o rosto surgindo
          }, 800); 
      }
    });
});
