// Morse code dictionary for letters and numbers
const morseCode = {
  'A': '.-',    'B': '-...',  'C': '-.-.',  'D': '-..',
  'E': '.',     'F': '..-.',  'G': '--.',   'H': '....',
  'I': '..',    'J': '.---',  'K': '-.-',   'L': '.-..',
  'M': '--',    'N': '-.',    'O': '---',   'P': '.--.',
  'Q': '--.-',  'R': '.-.',   'S': '...',   'T': '-',
  'U': '..-',   'V': '...-',  'W': '.--',   'X': '-..-',
  'Y': '-.--',  'Z': '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...',
  '8': '---..', '9': '----.',
  ' ': ' '  // space between words
};

// Create a reusable AudioContext
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Add event listeners for range inputs
document.addEventListener('DOMContentLoaded', () => {
  ['speed', 'pitch', 'volume'].forEach(id => {
    const input = document.getElementById(id);
    const display = input.parentElement.querySelector('.value-display');
    input.addEventListener('input', () => {
      display.textContent = input.value;
    });
  });
});

// Function to calculate durations based on WPM
function getDurations(wpm) {
  // At 20 WPM, dot is 50ms
  const unitLength = 1200 / wpm;
  return {
    dot: unitLength,
    dash: unitLength * 3,
    symbolSpace: unitLength,
    letterSpace: unitLength * 3,
    wordSpace: unitLength * 7
  };
}

// Function to play beep sound for a specified duration and frequency
function playBeep(duration = 150, frequency = 700, volume = 0.5) {
  return new Promise(resolve => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

    gainNode.gain.value = volume;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();

    setTimeout(() => {
      oscillator.stop();
      resolve();
    }, duration);
  });
}

// Convert text into Morse code string (dots, dashes, spaces)
function textToMorse(text) {
  return text.toUpperCase().split('').map(char => morseCode[char] || ' ').join(' ');
}

// Main function called when Play button is clicked
async function playMorse() {
  const button = document.querySelector('button');
  const input = document.getElementById('lyrics');
  
  // Get control values
  const wpm = parseInt(document.getElementById('speed').value);
  const frequency = parseInt(document.getElementById('pitch').value);
  const volume = parseInt(document.getElementById('volume').value) / 100;
  
  // Calculate timings based on WPM
  const durations = getDurations(wpm);
  
  // Disable input and button, show loading state
  const originalText = button.textContent;
  button.textContent = "Processing...";
  button.classList.add('loading');
  button.disabled = true;
  input.disabled = true;
  
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const text = input.value;
  const morse = textToMorse(text);
  document.getElementById('morse-output').innerText = morse;

  // Create audio buffer for recording
  const totalDuration = morse.split('').reduce((acc, symbol) => {
    if (symbol === '.') return acc + durations.dot + durations.symbolSpace;
    if (symbol === '-') return acc + durations.dash + durations.symbolSpace;
    return acc + durations.wordSpace;
  }, 0);
  
  const offlineContext = new OfflineAudioContext(1, audioContext.sampleRate * totalDuration / 1000, audioContext.sampleRate);

  // Record the beeps
  for (const symbol of morse) {
    if (symbol === '.') {
      await createBeepInBuffer(offlineContext, durations.dot, frequency, volume);
    } else if (symbol === '-') {
      await createBeepInBuffer(offlineContext, durations.dash, frequency, volume);
    } else {
      await addSilence(offlineContext, durations.wordSpace);
    }
    await addSilence(offlineContext, durations.symbolSpace);
  }

  // Render and save the audio
  const audioBuffer = await offlineContext.startRendering();
  const blob = await audioBufferToWav(audioBuffer);
  const url = URL.createObjectURL(blob);
  
  // Download and auto-delete after playing
  const link = document.createElement('a');
  link.href = url;
  link.download = 'morse.wav';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  
  // Play the morse code live
  for (const symbol of morse) {
    if (symbol === '.') {
      await playBeep(durations.dot, frequency, volume);
    } else if (symbol === '-') {
      await playBeep(durations.dash, frequency, volume);
    } else {
      await new Promise(resolve => setTimeout(resolve, durations.wordSpace));
    }
    await new Promise(resolve => setTimeout(resolve, durations.symbolSpace));
  }

  // Cleanup
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
    
    // Re-enable input and button, remove loading state
    button.textContent = originalText;
    button.classList.remove('loading');
    button.disabled = false;
    input.disabled = false;
  }, totalDuration);
}

// Helper function to create beep in buffer
function createBeepInBuffer(offlineContext, duration, frequency = 700, volume = 0.5) {
  const oscillator = offlineContext.createOscillator();
  const gainNode = offlineContext.createGain();
  
  gainNode.gain.value = volume;
  oscillator.connect(gainNode);
  gainNode.connect(offlineContext.destination);
  
  oscillator.frequency.setValueAtTime(frequency, offlineContext.currentTime);
  oscillator.start();
  oscillator.stop(offlineContext.currentTime + duration/1000);
  
  return new Promise(resolve => setTimeout(resolve, duration));
}

// Helper function to add silence to buffer
function addSilence(offlineContext, duration) {
  return new Promise(resolve => setTimeout(resolve, duration));
}

// Convert AudioBuffer to WAV Blob
function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2;
  const buffer1 = new ArrayBuffer(44 + length);
  const view = new DataView(buffer1);
  
  writeUTFBytes(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeUTFBytes(view, 8, 'WAVE');
  writeUTFBytes(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, numOfChan * 2, true);
  view.setUint16(34, 16, true);
  writeUTFBytes(view, 36, 'data');
  view.setUint32(40, length, true);

  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < channelData.length; i++) {
    view.setInt16(offset, channelData[i] * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer1], { type: 'audio/wav' });
}

function writeUTFBytes(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
