
```javascript
const Anthropic = require("@anthropic-ai/sdk");
const readline = require("readline");

const client = new Anthropic();

// Almacenamiento de recordatorios en memoria
let medications = [];
let conversationHistory = [];

const systemPrompt = `Eres un asistente de salud especializado en recordatorios de medicamentos. Tu rol es:
1. Ayudar a los usuarios a agregar recordatorios de medicamentos con detalles como nombre, dosis, horarios
2. Mostrar recordatorios activos
3. Actualizar o eliminar recordatorios
4. Alertar sobre medicamentos que deben tomarse próximamente
5. Proporcionar información sobre adherencia a medicamentos

Cuando el usuario quiera agregar un medicamento, extrae: nombre, dosis, horarios (formato HH:MM), descripción.
Cuando el usuario pida ver recordatorios, muestra la lista formateada.
Sé amable, preciso y enfocado en la salud del usuario.

Responde en formato JSON cuando sea necesario con esta estructura:
{
  "action": "add/view/remove/alert/update",
  "message": "tu respuesta al usuario",
  "data": {...}
}`;

async function chat(userMessage) {
  conversationHistory.push({
    role: "user",
    content: userMessage,
  });

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    system: systemPrompt,
    messages: conversationHistory,
  });

  const assistantMessage = response.content[0].text;
  conversationHistory.push({
    role: "assistant",
    content: assistantMessage,
  });

  return assistantMessage;
}

function parseResponse(response) {
  try {
    // Intenta parsear como JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Si no es JSON válido, continúa
  }
  return { message: response };
}

function addMedication(medicationData) {
  const medication = {
    id: medications.length + 1,
    name: medicationData.name || "Medicamento",
    dosage: medicationData.dosage || "Sin especificar",
    times: medicationData.times || ["09:00"],
    description: medicationData.description || "",
    createdAt: new Date(),
    lastTaken: null,
  };
  medications.push(medication);
  return medication;
}

function getMedicationsList() {
  if (medications.length === 0) {
    return "No hay medicamentos registrados aún.";
  }

  let list = "📋 Tus medicamentos:\n";
  medications.forEach((med, index) => {
    list += `\n${index + 1}. ${med.name}\n`;
    list += `   Dosis: ${med.dosage}\n`;
    list += `   Horarios: ${med.times.join(", ")}\n`;
    if (med.description) list += `   Notas: ${med.description}\n`;
    if (med.lastTaken) list += `   Última toma: ${med.lastTaken}\n`;
  });
  return list;
}

function checkUpcomingAlerts() {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const alerts = medications.filter((med) => {
    return med.times.some((time) => {
      const [hour, minute] = time.split(":");
      const timeDiff = Math.abs(
        parseInt(hour) * 60 +
          parseInt(minute) -
          (now.getHours() * 60 + now.getMinutes())
      );
      return timeDiff <= 15 && timeDiff >= 0; // Alerta 15 minutos antes
    });
  });

  return alerts;
}

function removeMedication(name) {
  const index = medications.findIndex(
    (med) => med.name.toLowerCase() === name.toLowerCase()
  );
  if (index > -1) {
    const removed = medications.splice(index, 1);
    return removed[0];
  }
  return null;
}

function updateMedicationTaken(name) {
  const med = medications.find(
    (m) => m.name.toLowerCase() === name.toLowerCase()
  );
  if (med) {
    med.lastTaken = new Date().toLocaleString();
    return med;
  }
  return null;
}

async function processUserInput(userMessage) {
  // Análisis especial para comandos rápidos
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes("mis medicamentos") || lowerMessage.includes("listar")) {
    return getMedicationsList();
  }

  if (lowerMessage.includes("alertas") || lowerMessage.includes("próximos")) {
    const alerts = checkUpcomingAlerts();
    if (alerts.length > 0) {
      return `⏰ Alertas de medicamentos próximos:\n${alerts.map((m) => `- ${m.name} (${m.dosage})`).join("\n")}`;
    } else {
      return "No hay medicamentos próximos en los próximos 15 minutos.";
    }
  }

  // Usar Claude para procesar el mensaje
  const response = await chat(userMessage);
  const parsed = parseResponse(response);

  // Procesar acciones detectadas por Claude
  if (typeof parsed === "object" && parsed.action) {
    switch (parsed.action) {
      case "add":
        if (parsed