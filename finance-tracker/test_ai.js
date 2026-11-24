import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

console.log('Testando chave:', process.env.GEMINI_API_KEY ? 'Presente' : 'Ausente');

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

try {
  const res = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: 'Diga: Teste realizado com sucesso'
  });
  console.log('Resposta da IA:', res.text);
} catch (err) {
  console.error('Erro na chamada da IA:', err);
}
