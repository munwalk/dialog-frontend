/**
 * PCMProcessor - 디버깅 강화 버전
 * -------------------------------------------------------
 * 실제 샘플레이트와 변환 상태를 로그로 확인
 * -------------------------------------------------------
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.inputRate = sampleRate;
    this.targetRate = 16000;
    this.ratio = this.inputRate / this.targetRate;

    this.inputBuffer = [];
    this.outputBuffer = [];
    
    this.FRAME_SIZE = 160;
    this.currentInputPosition = 0;

    // 디버깅 카운터
    this.inputSampleCount = 0;
    this.outputSampleCount = 0;
    this.processCount = 0;

    // 초기 로그
    this.port.postMessage({
      type: 'init',
      inputRate: this.inputRate,
      targetRate: this.targetRate,
      ratio: this.ratio
    });
  }

  toInt16(floatArray) {
    const out = new Int16Array(floatArray.length);
    for (let i = 0; i < floatArray.length; i++) {
      const s = Math.max(-1, Math.min(1, floatArray[i]));
      out[i] = Math.round(s * 0x7FFF);
    }
    return out;
  }

  resample() {
    const output = [];
    
    while (true) {
      const inputIndex = Math.floor(this.currentInputPosition);
      
      if (inputIndex >= this.inputBuffer.length) {
        break;
      }
      
      output.push(this.inputBuffer[inputIndex]);
      this.currentInputPosition += this.ratio;
    }
    
    const samplesProcessed = Math.floor(this.currentInputPosition);
    if (samplesProcessed > 0) {
      this.inputBuffer.splice(0, samplesProcessed);
      this.currentInputPosition -= samplesProcessed;
    }
    
    return output;
  }

  flushFrames() {
    while (this.outputBuffer.length >= this.FRAME_SIZE) {
      const frame = this.outputBuffer.splice(0, this.FRAME_SIZE);
      const pcm16 = this.toInt16(frame);
      this.port.postMessage(pcm16);
      this.outputSampleCount += this.FRAME_SIZE;
    }
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputSamples = input[0];
    this.processCount++;
    this.inputSampleCount += inputSamples.length;
    
    // 입력 버퍼에 누적
    for (let i = 0; i < inputSamples.length; i++) {
      this.inputBuffer.push(inputSamples[i]);
    }
    
    // Resampling
    const resampled = this.resample();
    
    // 출력 버퍼에 누적
    for (let i = 0; i < resampled.length; i++) {
      this.outputBuffer.push(resampled[i]);
    }
    
    // 프레임 전송
    this.flushFrames();

    // 주기적으로 통계 로그 (초당 1회)
    if (this.processCount % 375 === 0) {  // 48kHz: 375 * 128 = 48000 (1초)
      const actualRatio = this.inputSampleCount / Math.max(1, this.outputSampleCount);
      this.port.postMessage({
        type: 'stats',
        processCount: this.processCount,
        inputSamples: this.inputSampleCount,
        outputSamples: this.outputSampleCount,
        actualRatio: actualRatio.toFixed(3),
        expectedRatio: this.ratio.toFixed(3),
        bufferSize: this.inputBuffer.length + this.outputBuffer.length
      });
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);