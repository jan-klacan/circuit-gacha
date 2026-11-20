const colors = {
  electrical: "#d6ff6a",
  quantum: "#c6a4ff",
  membrane: "#63f0cb",
  signaling: "#ffb284",
};

export function artwork(set, symbol, number = 0) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 320;
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  const ink = colors[set];
  ctx.translate(160, 160);
  ctx.scale(1.6, 1.6);
  ctx.strokeStyle = ctx.fillStyle = ink;
  ctx.lineWidth = 0.85;
  ctx.lineJoin = ctx.lineCap = "round";

  function line(...points) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    points.slice(1).forEach(point => ctx.lineTo(...point));
    ctx.stroke();
  }
  function circle(x, y, radius, fill = false) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (fill) ctx.fill();
    else ctx.stroke();
  }
  function ellipse(x, y, rx, ry, angle = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
    ctx.stroke();
  }
  function dot(x, y) { circle(x, y, 2.5, true); }
  function cross(x, y, radius = 4) {
    line([x - radius, y], [x + radius, y]);
    line([x, y - radius], [x, y + radius]);
  }
  function label(text, x, y, size = 9) {
    ctx.font = `${size}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }
  function chip() {
    ctx.strokeRect(-28, -29, 56, 58);
    ctx.strokeRect(-22, -23, 44, 46);
    for (let n = -18; n <= 18; n += 9) {
      line([-36, n], [-28, n]); line([28, n], [36, n]);
      line([n, -36], [n, -29]); line([n, 29], [n, 36]);
    }
    label("ϟ", 0, 2, 35);
  }
  function tracework() {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.save();
        ctx.scale(sx, sy);
        for (let i = 0; i < 4; i++) {
          const edge = 42 + i * 8, offset = 8 + i * 9;
          line([39, offset], [edge + 8, offset], [edge + 26, offset + 18], [edge + 26, 78 - i * 3]);
          circle(edge + 26, 78 - i * 3, 2.3);
        }
        line([12, 39], [12, 60], [30, 78], [48, 78]);
        circle(50, 78, 2);
        ctx.restore();
      }
    }
  }
  function orbit() {
    circle(0, 0, 57);
    ellipse(0, 0, 55, 19);
    ellipse(0, 0, 19, 55, 0.52);
    ellipse(0, 0, 19, 55, -0.52);
    line([0, -68], [0, 68]);
    line([-72, 33], [72, -33]);
    line([-70, -30], [69, 27]);
    circle(0, 0, 3, true);
    dot(0, -57); dot(36, 14); dot(-37, 12);
    label("z", 0, -76); label("x", 79, -38); label("y", 77, 32);
  }
  function membrane(pump = false) {
    for (let x = -64; x <= 64; x += 8) {
      if (Math.abs(x) < 20) continue;
      for (const y of [-14, 14]) {
        circle(x, y, 2.6);
        line([x - 1, y * .77], [x - 1, y * .30]);
        line([x + 1, y * .77], [x + 1, y * .37]);
      }
    }
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.beginPath();
      ctx.moveTo(7, -32);
      ctx.bezierCurveTo(37, -44, 18, -3, 24, 12);
      ctx.bezierCurveTo(32, 37, 13, 39, 8, 28);
      ctx.bezierCurveTo(3, 12, 15, 1, 6, -16);
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    for (const y of [-42, -25, 6, 41]) dot(0, y);
    if (pump) label("ATP", 37, -37, 11);
  }
  function signal(switchSymbol = false) {
    const points = [[-54, -45], [-26, -24], [9, -42], [37, -17], [56, -48], [0, 1],
      [-55, 25], [-31, 46], [9, 44], [50, 39]];
    [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [3, 5], [5, 6], [6, 7], [7, 8], [5, 8], [8, 9]]
      .forEach(([a, b]) => line(points[a], points[b]));
    points.forEach(([x, y], i) => {
      circle(x, y, i === 5 ? 12 : 6);
      dot(x, y);
    });
    if (switchSymbol) {
      ctx.fillStyle = "#171621";
      circle(0, 1, 12, true);
      ctx.fillStyle = ink;
      label("±", 0, 1, 15);
    }
  }

  ctx.globalAlpha = 0.32;
  for (let y = -88; y <= 88; y += 11) {
    for (let x = -88; x <= 88; x += 11) circle(x, y, 0.65, true);
  }
  ctx.setLineDash([3, 5]);
  circle(0, 0, 71);
  ctx.setLineDash([]);
  circle(0, 0, 82);
  for (const x of [-78, 78]) for (const y of [-78, 78]) cross(x, y);
  ctx.globalAlpha = 1;
  if (!symbol) {
    if (set === "electrical") { tracework(); chip(); }
    if (set === "quantum") orbit();
    if (set === "membrane") membrane();
    if (set === "signaling") signal();
    return canvas;
  }
  if (set === "quantum") {
    const complex = ["cnot", "cz", "swap", "toffoli", "fredkin"].includes(symbol);
    const wires = !complex ? [0] : ["toffoli", "fredkin"].includes(symbol) ? [-43, 0, 43] : [-27, 27];
    ctx.lineWidth = 1.7;
    wires.forEach((y, i) => {
      line([-57, y], [62, y]);
      label(`q${i}`, -67, y, 8);
    });
    if (complex) {
      line([0, wires[0]], [0, wires.at(-1)]);
      wires.forEach((y, i) => {
        const swap = symbol === "swap" || (symbol === "fredkin" && i > 0);
        if (swap) {
          line([-7, y - 7], [7, y + 7]);
          line([7, y - 7], [-7, y + 7]);
        } else if (i < wires.length - 1 || symbol === "cz") dot(0, y);
        else {
          circle(0, y, 13);
          line([0, y - 13], [0, y + 13]);
        }
      });
    } else {
      ctx.clearRect(-23, -22, 46, 44);
      ctx.strokeRect(-23, -22, 46, 44);
      if (symbol === "measure") {
        ctx.beginPath();
        ctx.arc(0, 10, 13, Math.PI * 1.13, Math.PI * 1.87);
        ctx.stroke();
        line([0, 10], [10, -10]);
      } else label(symbol, 0, 2, 30);
    }
  } else if (set === "membrane" || set === "signaling") {
    ctx.lineWidth = 1.45;
    if (symbol === "pump" || symbol === "pore") membrane(symbol === "pump");
    else signal(symbol === "switch");
    ctx.globalAlpha = 0.62;
    label(`P${String(number).padStart(2, "0")}`, 0, 72);
  } else {
    ctx.lineWidth = 1.8;
    function diode(kind) {
      line([-65, 0], [-19, 0]); line([19, 0], [65, 0]);
      line([-19, -22], [19, 0], [-19, 22], [-19, -22]);
      if (kind === "zener") line([12, -22], [19, -15], [19, 15], [26, 22]);
      else line([19, -22], [19, 22]);
      if (kind === "led") for (const x of [-9, 10]) {
        line([x, -23], [x + 14, -36], [x + 7, -36]); line([x + 14, -36], [x + 14, -29]);
      }
    }
    const diagrams = {
      resistor: () => line([-65, 0], [-37, 0], [-29, -13], [-18, 13], [-7, -13], [4, 13], [15, -13], [26, 13], [37, 0], [65, 0]),
      capacitor: () => {
        line([-65, 0], [-11, 0]); line([11, 0], [65, 0]);
        line([-11, -27], [-11, 27]); line([11, -27], [11, 27]);
      },
      inductor: () => {
        line([-65, 0], [-40, 0]); line([40, 0], [65, 0]);
        for (const x of [-30, -10, 10, 30]) {
          ctx.beginPath(); ctx.arc(x, 0, 10, Math.PI, 2 * Math.PI); ctx.stroke();
        }
      },
      diode,
      led: diode,
      zener: diode,
      bjt: () => {
        circle(0, 0, 37);
        line([-61, 0], [-14, 0]); line([-14, -25], [-14, 25]);
        line([-14, -9], [24, -27], [24, -54]);
        line([-14, 9], [24, 27], [24, 54]);
        line([12, 13], [24, 27], [6, 28]);
        label("B", -69, 0); label("C", 24, -63); label("E", 24, 63);
      },
      mosfet: () => {
        circle(0, 0, 38);
        line([-62, 0], [-21, 0]); line([-21, -20], [-21, 20]);
        for (const y of [-20, 0, 20]) line([-12, y - 7], [-12, y + 7]);
        line([-12, -20], [20, -20], [20, -54]);
        line([-12, 20], [20, 20], [20, 54]);
        line([-12, 0], [20, 0], [20, 20]);
        line([-4, -4], [-12, 0], [-4, 4]);
        dot(20, 20);
        label("G", -70, 0); label("D", 20, -63); label("S", 20, 63);
      },
      oscillator: () => {
        ctx.strokeRect(-38, -29, 76, 58);
        line([0, -54], [0, -29]); line([0, 29], [0, 54]);
        line([38, 0], [59, 0]);
        line([-19, 9], [-19, -9], [-6, -9], [-6, 9], [7, 9], [7, -9], [20, -9], [20, 9]);
        label("VCC", 0, -64); label("GND", 0, 64); label("OUT", 67, -10);
      },
      amp: () => {
        line([-22, -35], [38, 0], [-22, 35], [-22, -35]);
        line([-65, -15], [-22, -15]); line([-65, 15], [-22, 15]); line([38, 0], [65, 0]);
        cross(-12, 15, 4); line([-16, -15], [-8, -15]);
        line([2, -44], [2, -21]); line([2, 21], [2, 44]);
        label("V+", 2, -54); label("V−", 2, 54);
      },
      instrumentation: () => {
        ctx.strokeRect(-34, -31, 68, 62);
        line([-57, -14], [-34, -14]); line([-57, 14], [-34, 14]);
        line([34, 0], [56, 0]); line([9, 31], [9, 51]);
        label("−", -25, -14, 13); label("+", -25, 14, 13);
        label("INA", 5, 0, 17); label("OUT", 67, -11); label("REF", 9, 61);
      },
      regulator: () => {
        ctx.strokeRect(-34, -31, 68, 62);
        line([-56, -14], [-34, -14]);
        line([34, -14], [56, -14]); line([34, 14], [56, 14]);
        line([0, 31], [0, 53]);
        label("VIN", -65, -25); label("SW", 65, -25); label("FB", 65, 14);
        label("GND", 0, 63); label("BUCK", 0, 0, 14);
      },
    };
    diagrams[symbol](symbol);
  }
  return canvas;
}
