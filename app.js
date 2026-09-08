const expressionElement = document.querySelector("#expression");
const resultElement = document.querySelector("#result");
const historyList = document.querySelector("#historyList");
const historyCount = document.querySelector("#historyCount");
const memoryIndicator = document.querySelector("#memoryIndicator");
const toast = document.querySelector("#toast");
const themeToggle = document.querySelector(".theme-toggle");

let expression = "";
let currentResult = "0";
let justCalculated = false;
let memory = Number(localStorage.getItem("orbit-memory") || 0);
let history = readHistory();
let toastTimer;

function readHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem("orbit-history") || "[]");
    return Array.isArray(saved) ? saved.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function formatNumber(value) {
  if (!Number.isFinite(value)) throw new Error("Invalid result");
  const rounded = Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12));
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 10,
    useGrouping: false,
  }).format(rounded);
}

function evaluateExpression(input) {
  const source = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  const tokens = source.match(/\d*\.?\d+(?:e[+-]?\d+)?|[+\-*/]/gi);
  if (!tokens || tokens.join("") !== source.replace(/\s/g, "") || tokens.length === 0) {
    throw new Error("Incomplete expression");
  }

  let index = 0;
  const peek = () => tokens[index];
  const consume = () => tokens[index++];

  function parsePrimary() {
    if (peek() === "-") {
      consume();
      return -parsePrimary();
    }
    const value = Number(consume());
    if (!Number.isFinite(value)) throw new Error("Invalid number");
    return value;
  }

  function parseMultiplication() {
    let value = parsePrimary();
    while (peek() === "*" || peek() === "/") {
      const operator = consume();
      const next = parsePrimary();
      if (operator === "/" && next === 0) throw new Error("Cannot divide by zero");
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  }

  function parseAddition() {
    let value = parseMultiplication();
    while (peek() === "+" || peek() === "-") {
      const operator = consume();
      const next = parseMultiplication();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  }

  const value = parseAddition();
  if (index !== tokens.length) throw new Error("Incomplete expression");
  return value;
}

function updateDisplay() {
  expressionElement.textContent = expression ? expression.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−") : "Ready when you are";
  resultElement.textContent = currentResult;
  memoryIndicator.hidden = memory === 0;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function saveHistory() {
  localStorage.setItem("orbit-history", JSON.stringify(history));
}

function renderHistory() {
  historyCount.textContent = history.length;
  if (!history.length) {
    historyList.innerHTML = `
      <div class="empty-history">
        <span class="empty-icon" aria-hidden="true">↗</span>
        <p>No calculations yet</p>
        <span>Your results will appear here</span>
      </div>`;
    return;
  }

  historyList.innerHTML = history.map((item, index) => `
    <button class="history-item" type="button" data-history-index="${index}" aria-label="Load ${item.expression} equals ${item.result}">
      <span class="history-expression">${item.expression.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−")}</span>
      <strong class="history-result">${item.result}</strong>
    </button>`).join("");
}

function addToHistory(expressionValue, resultValue) {
  history.unshift({ expression: expressionValue, result: resultValue });
  history = history.slice(0, 12);
  saveHistory();
  renderHistory();
}

function clearAll() {
  expression = "";
  currentResult = "0";
  justCalculated = false;
  updateDisplay();
}

function appendValue(value) {
  if (justCalculated && /[0-9.]/.test(value)) {
    expression = "";
    currentResult = "0";
    justCalculated = false;
  }

  if (value === ".") {
    const currentNumber = expression.split(/[+\-*/]/).pop();
    if (currentNumber.includes(".")) return;
    if (!currentNumber) expression += "0";
  }

  if (/[+\-*/]/.test(value)) {
    if (!expression && value !== "-") return;
    if (/[+\-*/]$/.test(expression)) {
      expression = expression.slice(0, -1) + value;
    } else {
      expression += value;
    }
  } else {
    expression += value;
  }
  currentResult = expression || "0";
  updateDisplay();
}

function applyPercent() {
  if (!expression) return;
  const match = expression.match(/(\d*\.?\d+)$/);
  if (!match) return;
  const value = Number(match[1]) / 100;
  expression = expression.slice(0, -match[1].length) + String(value);
  currentResult = String(value);
  updateDisplay();
}

function backspace() {
  expression = expression.slice(0, -1);
  currentResult = expression || "0";
  justCalculated = false;
  updateDisplay();
}

function calculate() {
  if (!expression || /[+\-*/]$/.test(expression)) return;
  try {
    const calculated = formatNumber(evaluateExpression(expression));
    addToHistory(expression, calculated);
    currentResult = calculated;
    expression = calculated;
    justCalculated = true;
    updateDisplay();
  } catch (error) {
    showToast(error.message === "Cannot divide by zero" ? error.message : "Check the expression");
  }
}

function valueForMemory() {
  try {
    return expression ? evaluateExpression(expression) : Number(currentResult) || 0;
  } catch {
    return Number(currentResult) || 0;
  }
}

function handleMemory(action) {
  if (action === "memory-clear") memory = 0;
  if (action === "memory-recall") {
    expression = String(memory);
    currentResult = formatNumber(memory);
    justCalculated = false;
  }
  if (action === "memory-add") memory += valueForMemory();
  if (action === "memory-subtract") memory -= valueForMemory();
  localStorage.setItem("orbit-memory", String(memory));
  updateDisplay();
  showToast(action === "memory-clear" ? "Memory cleared" : "Memory updated");
}

document.querySelectorAll("[data-value], [data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const { value, action } = button.dataset;
    if (value === "%") return applyPercent();
    if (value) return appendValue(value);
    if (action === "clear") return clearAll();
    if (action === "backspace") return backspace();
    if (action === "equals") return calculate();
    if (action.startsWith("memory-")) return handleMemory(action);
    if (action === "clear-history") {
      history = [];
      saveHistory();
      renderHistory();
      showToast("History cleared");
    }
  });
});

historyList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-history-index]");
  if (!item) return;
  const selected = history[Number(item.dataset.historyIndex)];
  expression = selected.expression;
  currentResult = selected.result;
  justCalculated = true;
  updateDisplay();
});

document.addEventListener("keydown", (event) => {
  const keyMap = { Enter: "equals", "=": "equals", Escape: "clear", Backspace: "backspace" };
  if (keyMap[event.key]) {
    event.preventDefault();
    document.querySelector(`[data-action="${keyMap[event.key]}"]`).click();
    return;
  }
  if (event.key === "%") return applyPercent();
  if (/^[0-9.+\-*/]$/.test(event.key)) {
    event.preventDefault();
    appendValue(event.key);
    const button = document.querySelector(`[data-value="${CSS.escape(event.key)}"]`);
    if (button) {
      button.classList.add("is-pressed");
      setTimeout(() => button.classList.remove("is-pressed"), 100);
    }
  }
});

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem("orbit-theme", document.body.classList.contains("light") ? "light" : "dark");
});

if (localStorage.getItem("orbit-theme") === "light") document.body.classList.add("light");
updateDisplay();
renderHistory();