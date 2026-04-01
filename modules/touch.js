(function (ns) {
  "use strict";

  ns.touch = ns.touch || {};

  function isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  function isMobile() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  /**
   * Touch-to-drag polyfill: converts touch events into synthetic drag events
   * so existing HTML5 DnD handlers work on touch devices unchanged.
   */
  function enableTouchDrag(el, options) {
    var dragState = null;

    el.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      var touch = e.touches[0];
      dragState = {
        startX: touch.clientX,
        startY: touch.clientY,
        started: false,
        el: el,
        currentTarget: null,
        data: {}
      };
    }, { passive: false });

    el.addEventListener("touchmove", function (e) {
      if (!dragState) return;
      var touch = e.touches[0];
      var dx = touch.clientX - dragState.startX;
      var dy = touch.clientY - dragState.startY;

      // Require 10px movement to start drag (avoid accidental)
      if (!dragState.started && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        dragState.started = true;
        var fakeEvent = makeFakeEvent(touch, el, dragState.data);
        if (options.onDragStart) options.onDragStart(fakeEvent);
        e.preventDefault();
      }

      if (dragState.started) {
        e.preventDefault();
        // Find element under finger
        el.style.pointerEvents = "none";
        var target = document.elementFromPoint(touch.clientX, touch.clientY);
        el.style.pointerEvents = "";

        if (target !== dragState.currentTarget) {
          if (dragState.currentTarget && options.onDragLeave) {
            options.onDragLeave(makeFakeEvent(touch, dragState.currentTarget, dragState.data));
          }
          dragState.currentTarget = target;
          if (target && options.onDragOver) {
            options.onDragOver(makeFakeEvent(touch, target, dragState.data));
          }
        } else if (target && options.onDragOver) {
          options.onDragOver(makeFakeEvent(touch, target, dragState.data));
        }
      }
    }, { passive: false });

    el.addEventListener("touchend", function (e) {
      if (!dragState || !dragState.started) {
        dragState = null;
        return;
      }
      var touch = e.changedTouches[0];
      el.style.pointerEvents = "none";
      var target = document.elementFromPoint(touch.clientX, touch.clientY);
      el.style.pointerEvents = "";

      if (target && options.onDrop) {
        options.onDrop(makeFakeEvent(touch, target, dragState.data));
      }
      if (options.onDragEnd) {
        options.onDragEnd();
      }
      dragState = null;
    }, { passive: false });
  }

  function makeFakeEvent(touch, target, data) {
    return {
      preventDefault: function () {},
      stopPropagation: function () {},
      currentTarget: target,
      target: target,
      clientX: touch.clientX,
      clientY: touch.clientY,
      dataTransfer: {
        effectAllowed: "move",
        dropEffect: "move",
        _data: data,
        setData: function (type, val) { data[type] = val; },
        getData: function (type) { return data[type] || ""; }
      }
    };
  }

  /**
   * Long-press gesture as replacement for dblclick on touch devices.
   */
  function enableLongPress(el, callback, duration) {
    duration = duration || 500;
    var timer = null;
    var startTouch = null;

    el.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      startTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      timer = setTimeout(function () {
        callback(e);
        timer = null;
      }, duration);
    }, { passive: true });

    el.addEventListener("touchmove", function (e) {
      if (!timer || !startTouch) return;
      var dx = e.touches[0].clientX - startTouch.x;
      var dy = e.touches[0].clientY - startTouch.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearTimeout(timer);
        timer = null;
      }
    }, { passive: true });

    el.addEventListener("touchend", function () {
      if (timer) { clearTimeout(timer); timer = null; }
    }, { passive: true });

    el.addEventListener("touchcancel", function () {
      if (timer) { clearTimeout(timer); timer = null; }
    }, { passive: true });
  }

  /**
   * Listen for mobile breakpoint changes at runtime.
   */
  function onMobileChange(callback) {
    var mq = window.matchMedia("(max-width: 768px)");
    mq.addEventListener("change", callback);
    return mq.matches;
  }

  ns.touch.isTouchDevice = isTouchDevice;
  ns.touch.isMobile = isMobile;
  ns.touch.enableTouchDrag = enableTouchDrag;
  ns.touch.enableLongPress = enableLongPress;
  ns.touch.onMobileChange = onMobileChange;
  ns.touch.makeFakeEvent = makeFakeEvent;
})(window.CamenCalendar = window.CamenCalendar || {});
