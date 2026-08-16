// AudioWorklet Processor para captura PCM-16 en tiempo real
// Archivo: public/pcm-worklet-processor.js
// Se carga como AudioWorkletNode para reemplazar el ScriptProcessorNode deprecated

class PcmWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    // Buffer acumulador: 320 muestras = 20ms a 16kHz
    this._buffer = new Int16Array(320)
    this._bufferIndex = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const samples = input[0] // Float32Array del canal mono

    for (let i = 0; i < samples.length; i++) {
      // Convertir float32 [-1, 1] → PCM-16 [-32768, 32767]
      const s = Math.max(-1.0, Math.min(1.0, samples[i]))
      this._buffer[this._bufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7fff

      // Cuando el buffer está lleno (320 muestras = 20ms), enviarlo al hilo principal
      if (this._bufferIndex >= 320) {
        // Enviar una copia del buffer vía postMessage
        this.port.postMessage(this._buffer.slice(0).buffer, [this._buffer.slice(0).buffer])
        this._bufferIndex = 0
      }
    }

    return true // Continuar procesando
  }
}

registerProcessor('pcm-worklet-processor', PcmWorkletProcessor)
