/* ==========================================================================
   EchoLens - Frontend Client JavaScript Core logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // --- UI Elements Reference ---
  const sysTimeEl = document.getElementById('systemTime');
  const btnConnectSerial = document.getElementById('btnConnectSerial');
  const btnToggleSimulate = document.getElementById('btnToggleSimulate');
  const btnToggleListening = document.getElementById('btnToggleListening');
  const btnSendDirect = document.getElementById('btnSendDirect');
  const btnResendCaption = document.getElementById('btnResendCaption');
  const btnClearDisplay = document.getElementById('btnClearDisplay');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const btnClearTerminal = document.getElementById('btnClearTerminal');
  
  const selectLanguage = document.getElementById('selectLanguage');
  const selectLayout = document.getElementById('selectLayout');
  const rangeBrightness = document.getElementById('rangeBrightness');
  const valBrightness = document.getElementById('valBrightness');
  const chkAutoSend = document.getElementById('chkAutoSend');
  
  const statusArduino = document.getElementById('statusArduino');
  const statusMic = document.getElementById('statusMic');
  const statusEngine = document.getElementById('statusEngine');
  const valArduino = document.getElementById('valArduino');
  const valMic = document.getElementById('valMic');
  const valEngine = document.getElementById('valEngine');
  
  const recPulseIndicator = document.getElementById('recPulseIndicator');
  const speechInstruction = document.getElementById('speechInstruction');
  const transcriptPlaceholder = document.getElementById('transcriptPlaceholder');
  const interimText = document.getElementById('interimText');
  const finalizedText = document.getElementById('finalizedText');
  
  const lcdScreen = document.getElementById('lcdScreen');
  const lcdLine1 = document.getElementById('lcdLine1');
  const lcdLine2 = document.getElementById('lcdLine2');
  const txtDirectSend = document.getElementById('txtDirectSend');
  
  const historyList = document.getElementById('historyList');
  const historyEmpty = document.getElementById('historyEmpty');
  const terminalLogs = document.getElementById('terminalLogs');

  // --- App State Variables ---
  let systemTimeInterval = null;
  let serialPort = null;
  let serialWriter = null;
  let isSimulatedSerial = false;
  let isListening = false;
  let speechRecognition = null;
  let forceStopSpeech = false;
  let lastCaptionText = "";
  
  // LCD Scrolling marquee state
  let lcdScrollInterval = null;
  let lcdLine1Text = "EchoLens Ready...";
  let lcdLine2Text = "Waiting for Input";

  // --- Clock update ---
  function updateTime() {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    sysTimeEl.textContent = timeStr;
  }
  updateTime();
  systemTimeInterval = setInterval(updateTime, 1000);

  // --- Terminal Logging System ---
  function log(message, tag = 'system') {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    
    const logLine = document.createElement('div');
    logLine.className = 'terminal-line';
    
    // Time span
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${timeStr}]`;
    logLine.appendChild(timeSpan);
    
    // Tag span
    const tagSpan = document.createElement('span');
    tagSpan.className = `log-tag tag-${tag}`;
    tagSpan.textContent = `[${tag.toUpperCase()}]`;
    logLine.appendChild(tagSpan);
    
    // Message span
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    logLine.appendChild(messageSpan);
    
    terminalLogs.appendChild(logLine);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  // Welcome Logs
  log("EchoLens Control dashboard initialized.", "system");
  log("Ready to interface with speech engine & serial endpoints.", "system");

  // --- Check Browser Features Support ---
  const isSerialSupported = 'serial' in navigator;
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isSpeechSupported = !!SpeechRecognitionAPI;

  if (!isSerialSupported) {
    log("Web Serial API is not supported on this browser. Try Chrome, Edge, or Opera.", "err");
    btnConnectSerial.disabled = true;
    btnConnectSerial.title = "Serial communication requires Chrome, Edge or Opera";
    btnConnectSerial.style.opacity = '0.5';
    btnConnectSerial.style.cursor = 'not-allowed';
  } else {
    log("Web Serial API detected and ready.", "system");
  }

  if (!isSpeechSupported) {
    log("Web Speech API (SpeechRecognition) is not supported. Use Chrome or Edge.", "err");
    btnToggleListening.disabled = true;
    btnToggleListening.style.opacity = '0.5';
    btnToggleListening.style.cursor = 'not-allowed';
    speechInstruction.textContent = "Speech recognition unsupported on this browser.";
  } else {
    log("Web Speech API detected and ready.", "system");
  }

  // --- 16x2 LCD Formatting & Display Engine ---
  
  function getSubstringLoop(str, start, len) {
    let res = '';
    for (let i = 0; i < len; i++) {
      res += str.charAt((start + i) % str.length);
    }
    return res;
  }

  function startLcdVisualScroll(rawLine1, rawLine2) {
    stopLcdVisualScroll();
    
    let l1 = rawLine1;
    let l2 = rawLine2;

    // Scroll ticker interval loop
    let offset1 = 0;
    let offset2 = 0;

    let pad1 = l1.length > 16 ? l1 + '    ' : l1.padEnd(16, ' ');
    let pad2 = l2.length > 16 ? l2 + '    ' : l2.padEnd(16, ' ');

    lcdScrollInterval = setInterval(() => {
      if (l1.length > 16) {
        lcdLine1.textContent = getSubstringLoop(pad1, offset1, 16);
        offset1 = (offset1 + 1) % pad1.length;
      } else {
        lcdLine1.textContent = l1.padEnd(16, ' ');
      }

      if (l2.length > 16) {
        lcdLine2.textContent = getSubstringLoop(pad2, offset2, 16);
        offset2 = (offset2 + 1) % pad2.length;
      } else {
        lcdLine2.textContent = l2.padEnd(16, ' ');
      }
    }, 350);
  }

  function stopLcdVisualScroll() {
    if (lcdScrollInterval) {
      clearInterval(lcdScrollInterval);
      lcdScrollInterval = null;
    }
  }

  function formatLCDLines(text) {
    // Sanitize non-ASCII chars
    let cleanText = text.replace(/[^\x20-\x7E]/g, '');
    cleanText = cleanText.trim();

    if (!cleanText) {
      return { line1: "".padEnd(16, " "), line2: "".padEnd(16, " "), raw1: "", raw2: "" };
    }

    const layout = selectLayout.value;
    let line1 = "";
    let line2 = "";
    let raw1 = "";
    let raw2 = "";

    if (layout === 'truncate') {
      raw1 = cleanText.substring(0, 16);
      raw2 = cleanText.substring(16, 32);
      line1 = raw1.padEnd(16, ' ');
      line2 = raw2.padEnd(16, ' ');
    } 
    else if (layout === 'scroll') {
      // For visual scrolling marquee, keep the full strings
      // We will scroll lines if they exceed 16 characters
      if (cleanText.length <= 16) {
        raw1 = cleanText;
        raw2 = "";
      } else {
        // Line 1 takes first 16, Line 2 takes the rest and scrolls it
        raw1 = cleanText.substring(0, 16);
        raw2 = cleanText.substring(16);
      }
      line1 = raw1.padEnd(16, ' ');
      line2 = raw2.padEnd(16, ' ');
    } 
    else {
      // Default: Smart Word Wrap
      const words = cleanText.split(' ');
      let currentLine1 = '';
      let currentLine2 = '';
      let isLine1Full = false;

      for (const word of words) {
        if (!word) continue;

        if (!isLine1Full) {
          const testStr = currentLine1 ? currentLine1 + ' ' + word : word;
          if (testStr.length <= 16) {
            currentLine1 = testStr;
          } else {
            isLine1Full = true;
            if (word.length <= 16) {
              currentLine2 = word;
            } else {
              currentLine2 = word.substring(0, 16);
            }
          }
        } else {
          const testStr = currentLine2 ? currentLine2 + ' ' + word : word;
          if (testStr.length <= 16) {
            currentLine2 = testStr;
          } else {
            // Drop out-of-bounds text to keep 16x2 layout neat
            break;
          }
        }
      }
      raw1 = currentLine1;
      raw2 = currentLine2;
      line1 = raw1.padEnd(16, ' ');
      line2 = raw2.padEnd(16, ' ');
    }

    return { line1, line2, raw1, raw2 };
  }

  function updateLCDDisplay(text) {
    stopLcdVisualScroll();
    
    const formatted = formatLCDLines(text);
    lcdLine1Text = formatted.raw1;
    lcdLine2Text = formatted.raw2;

    const layout = selectLayout.value;
    if (layout === 'scroll' && (formatted.raw1.length > 16 || formatted.raw2.length > 16)) {
      startLcdVisualScroll(formatted.raw1, formatted.raw2);
    } else {
      lcdLine1.textContent = formatted.line1;
      lcdLine2.textContent = formatted.line2;
    }

    // Send data to Serial Output (if connected or simulated)
    transmitToSerial(formatted.line1, formatted.line2);
  }

  // --- Serial Output Transmission ---
  async function transmitToSerial(line1, line2) {
    // Protocol: Line1 [16 chars] followed by Line2 [16 chars] and a delimiter
    const packet = `${line1}${line2}\n`;
    
    if (serialWriter) {
      try {
        await serialWriter.write(packet);
        log(`Sent text to Arduino: "${line1.trim()}" | "${line2.trim()}"`, "serial");
      } catch (err) {
        log(`Serial write error: ${err.message}`, "err");
        disconnectSerial();
      }
    } else if (isSimulatedSerial) {
      // Mock Serial activity logs
      const clean1 = line1.trim() || "[empty]";
      const clean2 = line2.trim() || "[empty]";
      log(`[SIMULATION] Sending serial packet (33 bytes) -> L1:"${clean1}" L2:"${clean2}"`, "serial");
    }
  }

  // --- Connect/Disconnect Serial ---
  async function connectSerial() {
    if (!isSerialSupported) return;
    
    // Disable simulation if running
    if (isSimulatedSerial) {
      toggleSimulation(false);
    }

    log("Opening serial port dialog...", "system");
    try {
      serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 9600 });
      
      const encoder = new TextEncoderStream();
      encoder.readable.pipeTo(serialPort.writable);
      serialWriter = encoder.writable.getWriter();
      
      // Update UI Status Indicators
      statusArduino.querySelector('.status-indicator-dot').className = 'status-indicator-dot dot-online';
      valArduino.textContent = "Connected (9600 Baud)";
      valArduino.className = "status-value val-online";
      btnConnectSerial.textContent = "Disconnect Arduino";
      
      log("Successfully connected to Arduino Uno.", "system");
      
      // Send handshake/startup screen
      updateLCDDisplay("EchoLens LCD Connected");
      
      // Watch for hardware disconnection
      navigator.serial.addEventListener('disconnect', handleDeviceDisconnected);

    } catch (err) {
      log(`Could not connect: ${err.message}`, "err");
      disconnectSerial();
    }
  }

  function disconnectSerial() {
    stopLcdVisualScroll();
    
    if (serialWriter) {
      try {
        serialWriter.releaseLock();
      } catch(e){}
      serialWriter = null;
    }
    
    if (serialPort) {
      try {
        serialPort.close();
      } catch(e){}
      serialPort = null;
    }

    statusArduino.querySelector('.status-indicator-dot').className = 'status-indicator-dot dot-offline';
    valArduino.textContent = "Disconnected";
    valArduino.className = "status-value val-offline";
    btnConnectSerial.textContent = "Connect Arduino";
    
    log("Serial connection terminated.", "system");
  }

  function handleDeviceDisconnected(event) {
    if (event.port === serialPort) {
      log("Warning: Arduino was physically unplugged.", "err");
      disconnectSerial();
    }
  }

  btnConnectSerial.addEventListener('click', () => {
    if (serialPort) {
      disconnectSerial();
    } else {
      connectSerial();
    }
  });

  // --- Emulate / Simulation Mode ---
  function toggleSimulation(forceValue) {
    const shouldEnable = (forceValue !== undefined) ? forceValue : !isSimulatedSerial;
    
    if (shouldEnable) {
      if (serialPort) {
        disconnectSerial();
      }
      isSimulatedSerial = true;
      statusArduino.querySelector('.status-indicator-dot').className = 'status-indicator-dot dot-searching';
      valArduino.textContent = "Emulated Port";
      valArduino.className = "status-value val-searching";
      btnToggleSimulate.textContent = "Disable Simulation";
      btnToggleSimulate.className = "btn btn-secondary btn-danger";
      log("Hardware simulation mode enabled. Text packets will display in console.", "system");
    } else {
      isSimulatedSerial = false;
      statusArduino.querySelector('.status-indicator-dot').className = 'status-indicator-dot dot-offline';
      valArduino.textContent = "Disconnected";
      valArduino.className = "status-value val-offline";
      btnToggleSimulate.textContent = "Enable Simulation";
      btnToggleSimulate.className = "btn btn-secondary btn-caution";
      log("Hardware simulation mode disabled.", "system");
    }
  }

  btnToggleSimulate.addEventListener('click', () => {
    toggleSimulation();
  });


  // --- Speech Recognition Integration ---
  if (isSpeechSupported) {
    speechRecognition = new SpeechRecognitionAPI();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    
    speechRecognition.onstart = () => {
      isListening = true;
      btnToggleListening.classList.add('listening');
      recPulseIndicator.classList.add('active');
      speechInstruction.textContent = "Speech Engine is active. Speak now.";
      
      statusMic.querySelector('.status-indicator-dot').className = 'status-indicator-dot dot-listening';
      valMic.textContent = "Active";
      valMic.className = "status-value val-listening";
      
      statusEngine.querySelector('.status-indicator-dot').className = 'status-indicator-dot dot-online';
      valEngine.textContent = "Running";
      valEngine.className = "status-value val-online";
      
      log("Speech recognition started.", "speech");
    };

    speechRecognition.onerror = (event) => {
      log(`Speech recognition error: ${event.error}`, "err");
      if (event.error === 'not-allowed') {
        speechInstruction.textContent = "Microphone access blocked. Check permissions.";
        forceStopSpeech = true;
        stopListening();
      }
    };

    speechRecognition.onend = () => {
      isListening = false;
      btnToggleListening.classList.remove('listening');
      recPulseIndicator.classList.remove('active');
      
      statusMic.querySelector('.status-indicator-dot').className = 'status-indicator-dot dot-offline';
      valMic.textContent = "Inactive";
      valMic.className = "status-value val-offline";
      
      statusEngine.querySelector('.status-indicator-dot').className = 'status-indicator-dot dot-offline';
      valEngine.textContent = "Idle";
      valEngine.className = "status-value val-offline";
      
      log("Speech recognition stopped.", "speech");
      
      // Auto-restart speech engine if not stopped manually by user
      if (!forceStopSpeech) {
        log("Auto-restarting speech engine to maintain connection...", "speech");
        speechRecognition.start();
      }
    };

    speechRecognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      transcriptPlaceholder.style.display = (interimTranscript || finalTranscript) ? 'none' : 'block';
      interimText.textContent = interimTranscript;

      // Handle final transcription block
      if (finalTranscript.trim()) {
        const cleanText = finalTranscript.trim();
        finalizedText.textContent = cleanText;
        lastCaptionText = cleanText;
        
        log(`Recognized final speech: "${cleanText}"`, "speech");

        // Instantly save to feed history
        saveToFeedHistory(cleanText);

        // Auto-transmit directly to simulated/real hardware screen
        if (chkAutoSend.checked) {
          updateLCDDisplay(cleanText);
        }
      }
    };
  }

  function startListening() {
    if (!isSpeechSupported) return;
    forceStopSpeech = false;
    speechRecognition.lang = selectLanguage.value;
    try {
      speechRecognition.start();
    } catch(e) {
      log(`Error starting speech recognition: ${e.message}`, "err");
    }
  }

  function stopListening() {
    if (!isSpeechSupported) return;
    forceStopSpeech = true;
    try {
      speechRecognition.stop();
    } catch(e) {
      log(`Error stopping speech recognition: ${e.message}`, "err");
    }
    speechInstruction.textContent = "Click the microphone to start transcribing";
    interimText.textContent = "";
    finalizedText.textContent = "";
    transcriptPlaceholder.style.display = 'block';
  }

  btnToggleListening.addEventListener('click', () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  });

  // Re-initialize speech language on dropdown changes
  selectLanguage.addEventListener('change', () => {
    log(`Speech language changed to ${selectLanguage.value}`, "system");
    if (isListening) {
      // Restart engine to apply new language
      stopListening();
      setTimeout(startListening, 300);
    }
  });


  // --- Saved Feed / Transcription History ---
  function saveToFeedHistory(text) {
    if (!text.trim()) return;

    // Remove empty placeholder
    historyEmpty.style.display = 'none';

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    const feedItem = document.createElement('div');
    feedItem.className = 'history-item';
    
    // Time Header container
    const itemHeader = document.createElement('div');
    itemHeader.className = 'history-header';
    itemHeader.style.marginBottom = '4px';
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'history-time';
    timeSpan.textContent = timeStr;
    itemHeader.appendChild(timeSpan);
    
    // Quick re-send button
    const btnSendItem = document.createElement('button');
    btnSendItem.className = 'btn-text-link';
    btnSendItem.textContent = '🚀 Send';
    btnSendItem.style.fontSize = '10px';
    btnSendItem.addEventListener('click', (e) => {
      e.stopPropagation();
      log(`Re-transmitting caption from history: "${text}"`, "system");
      lastCaptionText = text;
      updateLCDDisplay(text);
    });
    itemHeader.appendChild(btnSendItem);
    
    feedItem.appendChild(itemHeader);

    // Text Content
    const textSpan = document.createElement('span');
    textSpan.className = 'history-text';
    textSpan.textContent = text;
    feedItem.appendChild(textSpan);

    // Prepend to top of list
    historyList.insertBefore(feedItem, historyList.firstChild);
  }

  // --- Display controls button actions ---

  // Clear Display button
  btnClearDisplay.addEventListener('click', () => {
    log("Clearing LCD screens.", "system");
    updateLCDDisplay("");
  });

  // Resend Caption button
  btnResendCaption.addEventListener('click', () => {
    if (lastCaptionText) {
      log(`Re-sending last caption text: "${lastCaptionText}"`, "system");
      updateLCDDisplay(lastCaptionText);
    } else {
      log("No recent caption found to re-send.", "err");
    }
  });

  // Direct Text Send Message
  btnSendDirect.addEventListener('click', () => {
    const text = txtDirectSend.value.trim();
    if (text) {
      log(`Sending direct message: "${text}"`, "system");
      lastCaptionText = text;
      updateLCDDisplay(text);
      saveToFeedHistory(text);
      txtDirectSend.value = "";
    } else {
      log("Direct send text cannot be empty.", "err");
    }
  });

  txtDirectSend.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      btnSendDirect.click();
    }
  });

  // Clear History
  btnClearHistory.addEventListener('click', () => {
    historyList.innerHTML = '';
    historyList.appendChild(historyEmpty);
    historyEmpty.style.display = 'block';
    log("Transcription feed history cleared.", "system");
  });

  // Clear Terminal Logs
  btnClearTerminal.addEventListener('click', () => {
    terminalLogs.innerHTML = '';
    log("Terminal console logs cleared.", "system");
  });

  // Slider Brightness handling
  rangeBrightness.addEventListener('input', () => {
    const brightness = rangeBrightness.value;
    valBrightness.textContent = `${brightness}%`;
    
    // Change LCD backlight visually
    const opacity = brightness / 100;
    lcdScreen.style.opacity = opacity;
    
    // Also simulate a hardware backlight command
    if (serialWriter) {
      // E.g. send brightness command format
      const brightHex = Math.round((brightness / 100) * 255).toString(16).padStart(2, '0');
      serialWriter.write(`B:${brightHex}\n`);
    } else if (isSimulatedSerial) {
      log(`[SIMULATION] LCD Backlight brightness set command sent: B:${brightness}%`, "serial");
    }
  });

  // Layout change updates visual preview immediately
  selectLayout.addEventListener('change', () => {
    log(`LCD layout wrapping mode changed to [${selectLayout.value.toUpperCase()}]`, "system");
    if (lastCaptionText) {
      updateLCDDisplay(lastCaptionText);
    }
  });
});
