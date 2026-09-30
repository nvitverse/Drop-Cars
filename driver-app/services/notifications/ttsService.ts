import * as Speech from 'expo-speech';

export interface TTSTripAlertOptions {
  pickup: string;
  drop: string;
  totalFare: number;
  tripType?: string;
  language?: 'ta' | 'en' | 'hi';
}

export class TTSService {
  private isSpeaking: boolean = false;

  /**
   * Announce a new incoming trip with voice instructions in Tamil, English, or Hindi.
   */
  public async announceNewTrip(options: TTSTripAlertOptions): Promise<void> {
    try {
      if (this.isSpeaking) {
        await Speech.stop();
      }

      const { pickup, drop, totalFare, tripType = 'Oneway', language = 'en' } = options;

      let message = '';
      let speechLanguage = 'en-IN';

      if (language === 'ta') {
        speechLanguage = 'ta-IN';
        message = `புதிய ${tripType} சவாரி. ${pickup} முதல் ${drop} வரை. கட்டணம் ரூபாய் ${Math.round(totalFare)}. ஏற்ற ஒப்புக்கொள்ளவும்.`;
      } else if (language === 'hi') {
        speechLanguage = 'hi-IN';
        message = `नया ${tripType} ट्रिप. ${pickup} से ${drop}. किराया ₹${Math.round(totalFare)}. स्वीकार करने के लिए टैप करें.`;
      } else {
        speechLanguage = 'en-IN';
        message = `New ${tripType} trip from ${pickup} to ${drop}. Fare ${Math.round(totalFare)} rupees. Tap to accept!`;
      }

      this.isSpeaking = true;
      Speech.speak(message, {
        language: speechLanguage,
        pitch: 1.0,
        rate: 0.95,
        onDone: () => {
          this.isSpeaking = false;
        },
        onError: (err) => {
          console.warn('[TTSService] Speech error:', err);
          this.isSpeaking = false;
        },
      });
    } catch (err) {
      console.warn('[TTSService] Failed to speak trip alert:', err);
    }
  }

  /**
   * Stop any current speech playback.
   */
  public async stop(): Promise<void> {
    try {
      await Speech.stop();
      this.isSpeaking = false;
    } catch {}
  }
}

export const ttsService = new TTSService();
export default ttsService;
