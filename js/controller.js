(() => {
  const startBtn = document.getElementById('startBtn');
  let joystickDirty = false;

  // URL-dən nickname oxunması
  const urlParams = new URLSearchParams(window.location.search);
  const playerNickname = urlParams.get('nick') ? decodeURIComponent(urlParams.get('nick')) : "PLAYER";
  
  const nicknameDisplay = document.getElementById('nicknameDisplay');
  if (nicknameDisplay) {
    nicknameDisplay.textContent = playerNickname;
  }

  function showStartScreen() {
    document.body.classList.remove('controller-active');

    if (window.controllerState) {
      window.controllerState.x = 0;
      window.controllerState.y = 0;
      window.controllerState.buttons = { A: false, B: false, X: false, Y: false };
    }

    const knobElement = document.getElementById('stickKnob');
    if (knobElement) knobElement.style.transform = 'translate(0px, 0px)';

    document.querySelectorAll('.game-btn').forEach(button => {
      button.classList.remove('pressed');
    });
  }

  function showController() {
    document.body.classList.add('controller-active');
  }

  async function enterController() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {}

    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (err) {}

    showController();
  }

  startBtn.addEventListener('click', enterController);

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      showController();
    } else {
      showStartScreen();
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch (err) {}
    }
  });

  const area = document.getElementById('stickArea');
  const knob = document.getElementById('stickKnob');
  let activePointer = null;
  let radius = 0;

  window.controllerState = {
    x: 0,
    y: 0,
    nickname: playerNickname,
    buttons: { A: false, B: false, X: false, Y: false }
  };

  let ws;
  function connectWebSocket() {
    // Buludda 'https' olduğu üçün 'wss://', lokalda 'http' olduğu üçün 'ws://' avtomatik seçilir
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const serverUri = protocol + window.location.host;
    ws = new WebSocket(serverUri);

    ws.onopen = () => { 
      console.log("WebSocket serverə qoşuldu!"); 
      const joinMessage = {
        type: "PLAYER_JOIN",
        nickname: playerNickname
      };
      ws.send(JSON.stringify(joinMessage));
    };
    
    // qalan hissələr eyni qalır...
    
   ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Server mesajı onsuz da birbaşa bu pulta göndərdiyi üçün birbaşa yoxlayırıq:
      if (data.type === "DASH_STARTED") {
        const btnB = document.getElementById('btnB');
        if (btnB) startCooldown(btnB, 7000); 
      } else if (data.type === "ACTION_STARTED") {
        const btnX = document.getElementById('btnX');
        if (btnX) startCooldown(btnX, 2000); 
      }
    } catch (e) {}
  };

    ws.onclose = () => { setTimeout(connectWebSocket, 2000); };
    ws.onerror = (error) => {};
  }
  connectWebSocket();

  function sendStateToServer() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(window.controllerState));
    }
  }

  // Joystick məlumatlarını maksimum 50 dəfə/saniyə göndəririk
setInterval(() => {
    // Əgər joystick hərəkət edibsə VƏ YA hər hansı bir düymə basılıbsa göndər
    const isMoving = window.controllerState.x !== 0 || window.controllerState.y !== 0;
    const isButtonPressed = Object.values(window.controllerState.buttons).some(b => b);

    if (
        (joystickDirty || isMoving || isButtonPressed) &&
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        sendStateToServer();
        joystickDirty = false;
    }
}, 20);

  function updateStick(event) {
    const rect = area.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    radius = rect.width * 0.29;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) {
      dx = (dx / distance) * radius;
      dy = (dy / distance) * radius;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const x = Math.max(-1, Math.min(1, dx / radius));
    const y = Math.max(-1, Math.min(1, -dy / radius));
    
    window.controllerState.x = Number(x.toFixed(3));
    window.controllerState.y = Number(y.toFixed(3));

    joystickDirty = true;
  }

  function resetStick() {
    activePointer = null;
    knob.style.transform = 'translate(0px, 0px)';
    window.controllerState.x = 0;
    window.controllerState.y = 0;
    sendStateToServer();
    joystickDirty = false;
  }

  area.addEventListener('pointerdown', e => { e.preventDefault(); activePointer = e.pointerId; area.setPointerCapture(e.pointerId); updateStick(e); });
  area.addEventListener('pointermove', e => { if (e.pointerId === activePointer) { e.preventDefault(); updateStick(e); } });
  area.addEventListener('pointerup', e => { if (e.pointerId === activePointer) resetStick(); });
  area.addEventListener('pointercancel', resetStick);
  area.addEventListener('lostpointercapture', resetStick);

  const buttons = document.querySelectorAll('.game-btn');
  buttons.forEach(button => {
    const name = button.dataset.button;

    const press = e => {
      e.preventDefault();
      if (button.classList.contains('cooldown')) return;

      button.classList.add('pressed');
      window.controllerState.buttons[name] = true;
      sendStateToServer();
    };

    const release = e => {
      e.preventDefault();
      button.classList.remove('pressed');
      window.controllerState.buttons[name] = false;
      sendStateToServer();
    };

    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', e => e.preventDefault());
  });

  function startCooldown(button, duration) {
    button.classList.add('cooldown');
    const overlay = button.querySelector('.cooldown-overlay');
    let start = performance.now();

    function step(timestamp) {
      let elapsed = timestamp - start;
      let progress = Math.max(0, 360 - (elapsed / duration) * 360);
      if (overlay) overlay.style.setProperty('--progress', progress + 'deg');

      if (elapsed < duration) {
        requestAnimationFrame(step);
      } else {
        button.classList.remove('cooldown');
        if (overlay) overlay.style.setProperty('--progress', '0deg');
      }
    }
    requestAnimationFrame(step);
  }
})();