(function () {
  var ids = ['top', 'right', 'bottom', 'left', 'gap'];
  var inputs = {};
  ids.forEach(function (id) { inputs[id] = document.getElementById(id); });
  var verticalLock = document.getElementById('vertical-lock');
  var horizontalLock = document.getElementById('horizontal-lock');
  var applyButton = document.getElementById('apply');
  var feedback = document.getElementById('feedback');
  var locked = { vertical: false, horizontal: false };
  var resizeFrame = 0;
  var lastHeight = 0;

  function reportSize() {
    resizeFrame = 0;
    var panel = document.querySelector('.panel');
    if (!panel) return;
    // body.scrollHeight can equal the current iframe height in Figma. Measure
    // the actual content panel instead so the window ends shortly after the button.
    var height = Math.ceil(panel.getBoundingClientRect().bottom + 4);
    if (Math.abs(height - lastHeight) < 2) return;
    lastHeight = height;
    parent.postMessage({ pluginMessage: { type: 'resize', height: height + 2 } }, '*');
  }

  function scheduleResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(reportSize);
  }

  function setFeedback(text, kind) {
    feedback.textContent = text || '';
    feedback.className = 'feedback' + (kind ? ' ' + kind : '');
    scheduleResize();
  }

  function parseInput(input) {
    var raw = input.value.trim();
    var valid = raw !== '' && /^\d+$/.test(raw) && Number(raw) >= 0 && Number(raw) <= 10000;
    input.classList.toggle('invalid', !valid);
    return valid ? Number(raw) : null;
  }

  function sync(source, target) {
    inputs[target].value = inputs[source].value;
    inputs[target].classList.remove('invalid');
  }

  inputs.top.addEventListener('input', function () { if (locked.vertical) sync('top', 'bottom'); });
  inputs.bottom.addEventListener('input', function () { if (locked.vertical) sync('bottom', 'top'); });
  inputs.left.addEventListener('input', function () { if (locked.horizontal) sync('left', 'right'); });
  inputs.right.addEventListener('input', function () { if (locked.horizontal) sync('right', 'left'); });
  ids.forEach(function (id) { inputs[id].addEventListener('blur', function () { parseInput(inputs[id]); }); });

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(scheduleResize).observe(document.body);
  } else {
    window.addEventListener('resize', scheduleResize);
  }
  window.addEventListener('load', scheduleResize);
  scheduleResize();

  verticalLock.addEventListener('click', function () {
    locked.vertical = !locked.vertical;
    verticalLock.setAttribute('aria-pressed', String(locked.vertical));
    if (locked.vertical) sync('top', 'bottom');
  });
  horizontalLock.addEventListener('click', function () {
    locked.horizontal = !locked.horizontal;
    horizontalLock.setAttribute('aria-pressed', String(locked.horizontal));
    if (locked.horizontal) sync('left', 'right');
  });

  applyButton.addEventListener('click', function () {
    var values = {};
    var invalid = false;
    ids.forEach(function (id) {
      var value = parseInput(inputs[id]);
      if (value === null) invalid = true;
      values[id] = value;
    });
    if (invalid) {
      setFeedback('请填写 0 到 10000 之间的非负整数。', 'error');
      return;
    }
    applyButton.disabled = true;
    setFeedback('');
    parent.postMessage({ pluginMessage: { type: 'apply', values: values } }, '*');
  });

  window.onmessage = function (event) {
    var message = event.data && event.data.pluginMessage;
    if (!message) return;
    if (message.type === 'complete') {
      applyButton.disabled = false;
      setFeedback('');
      return;
    }
    if (message.type !== 'result') return;
    applyButton.disabled = false;
    if (message.summary && (message.summary.skipped || message.summary.failed)) {
      var lines = ['成功 ' + message.summary.success + '，跳过 ' + message.summary.skipped + '，失败 ' + message.summary.failed + '。'];
      (message.items || []).forEach(function (item) {
        if (item.status !== 'success') lines.push(item.name + '：' + item.reason);
      });
      setFeedback(lines.join('\n'), message.summary.success ? 'success' : 'error');
      feedback.style.whiteSpace = 'pre-line';
    } else {
      setFeedback(message.message || '处理完成。', message.ok ? 'success' : 'error');
    }
  };
})();
