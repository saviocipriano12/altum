import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";

const args = new Set(process.argv.slice(2));
const runBuild = args.has("--build") || args.has("--full");
const runDeep = args.has("--deep") || args.has("--full");
const securityOnly = args.has("--security");

const qaDir = ".qa-artifacts";
await mkdir(qaDir, { recursive: true });

const ciBuildEnv = {
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_FIREBASE_API_KEY: "ci-placeholder-not-a-real-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-altum-rules.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-rules",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-rules.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:ci",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
};

const coreSteps = [
  {
    name: "Mapear conexoes app/cliente -> app/api",
    command: "node scripts/audit-client-connections.mjs",
  },
  {
    name: "Smoke tests de contratos e regras de negocio",
    command: "npm run test:smoke",
  },
  {
    name: "TypeScript e rotas Next",
    command: "npm run typecheck",
  },
  {
    name: "ESLint com teto atual de warnings",
    command: "npm run lint -- --max-warnings=24",
  },
  {
    name: "Auditoria npm para vulnerabilidades altas ou criticas",
    command: "npm audit --audit-level=high",
  },
];

const securitySteps = [
  {
    name: "Regras Firebase em emuladores demo",
    command: "npm run test:firebase-rules -- --non-interactive",
  },
  {
    name: "Semgrep, se o binario estiver instalado",
    command: "semgrep scan --config p/nextjs --config p/javascript --config p/typescript --config p/secrets",
    advisory: true,
  },
  {
    name: "Trivy, se o binario estiver instalado",
    command: "trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL .",
    advisory: true,
  },
];

const deepSteps = [
  {
    name: "React Doctor para saude de componentes React",
    command: "npx --yes react-doctor@latest",
    advisory: true,
  },
  {
    name: "Knip para codigo morto, dependencias e exports",
    command: "npx --yes knip@latest --production --reporter compact --no-exit-code",
    advisory: true,
  },
  {
    name: "Dependency Cruiser para grafo da area do cliente",
    command: `npx --yes dependency-cruiser@latest app/cliente app/lib lib --include-only "^app/cliente|^app/lib|^lib" --output-type json --output-to ${qaDir}/dependency-cruiser-client.json --no-config`,
    advisory: true,
  },
];

const buildStep = {
  name: "Build Next com configuracao demo isolada",
  command: "npm run build",
  env: ciBuildEnv,
};

const steps = securityOnly ? [...securitySteps] : [...coreSteps];
if (!securityOnly && runDeep) steps.push(...deepSteps);
if (!securityOnly && runBuild) steps.push(buildStep);

let failed = false;
const requiredFailures = [];

console.log("\nAltum Quality & Security Suite");
console.log(`Modo: ${securityOnly ? "seguranca" : runBuild && runDeep ? "completo" : runDeep ? "profundo" : "padrao"}`);
console.log(`Artefatos: ${qaDir}\n`);

for (const step of steps) {
  console.log(`\n--- ${step.name}`);
  console.log(`$ ${step.command}`);

  const code = await run(step.command, step.env);
  if (code === 0) {
    console.log(`OK: ${step.name}`);
    continue;
  }

  if (step.advisory) {
    console.log(`AVISO: ${step.name} terminou com exit ${code}. Revisar saida acima; nao bloqueia este runner.`);
    continue;
  }

  failed = true;
  requiredFailures.push(step.name);
  console.log(`FALHOU: ${step.name} terminou com exit ${code}.`);
  if (!securityOnly) break;
}

if (failed) {
  if (requiredFailures.length > 1) {
    console.log(`\nBloqueios obrigatorios: ${requiredFailures.join("; ")}`);
  }
  console.log("\nSuite reprovada. Corrija o primeiro bloqueio antes de confiar no restante.");
  process.exitCode = 1;
} else {
  console.log("\nSuite concluida. Verifique avisos opcionais e artefatos antes de publicar.");
}

function run(command, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        ...extraEnv,
      },
    });

    child.on("error", (error) => {
      console.error(error.message);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}
