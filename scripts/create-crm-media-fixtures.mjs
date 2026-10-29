import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

// Local, synthetic fixtures only. No recording, customer data or API calls.
if (process.platform !== "win32") throw new Error("This synthetic speech fixture uses the installed Windows Portuguese voice.");
const output = resolve(".qa-artifacts/crm-live-media");
mkdirSync(output, { recursive: true });
const pathLiteral = resolve(output, "buyer.wav").replaceAll("'", "''");
const speech = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
  Add-Type -AssemblyName System.Speech
  $crmFixtureSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    $crmFixtureVoice = $crmFixtureSpeaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'pt-BR' } | Select-Object -First 1
    if (-not $crmFixtureVoice) { throw 'No installed pt-BR speech voice available.' }
    $crmFixtureSpeaker.SelectVoice($crmFixtureVoice.VoiceInfo.Name)
    $crmFixtureFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $crmFixtureSpeaker.SetOutputToWaveFile('${pathLiteral}', $crmFixtureFormat)
    $crmFixtureSpeaker.Speak('Meu orçamento é de três mil reais. Preciso implantar o atendimento até sexta-feira. Eu sou a dona da loja.')
  } finally { $crmFixtureSpeaker.Dispose() }
`], { windowsHide: true, encoding: "utf8", timeout: 30000 });
if (speech.error || speech.status !== 0) throw new Error(speech.error?.message || speech.stderr || "Synthetic speech fixture failed");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="white"/><text x="65" y="100" font-family="Arial" font-size="42" fill="#153067">PROPOSTA FICTICIA</text><path d="M140 190 L260 145 L320 190 L395 155 L500 220 L445 310 L390 280 L390 530 L210 530 L210 280 L155 310 L100 225 Z" fill="#2868dd"/><text x="560" y="260" font-family="Arial" font-size="32">CAMISETA AZUL</text><text x="560" y="340" font-family="Arial" font-size="32">100 unidades</text><text x="560" y="425" font-family="Arial" font-size="38">TOTAL: R$ 1.200,00</text><text x="65" y="630" font-family="Arial" font-size="27">Imagem de proposta. Nao confirma aceite ou pagamento.</text></svg>`;
await sharp(Buffer.from(svg)).png().toFile(resolve(output, "proposal.png"));
process.stdout.write(JSON.stringify({ generated: true, syntheticOnly: true, apiCalls: 0, output }));
