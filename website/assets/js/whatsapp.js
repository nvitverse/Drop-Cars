console.log("whatsapp.js loaded, readyState:", document.readyState);

function ensureWhatsAppWidget() {
  console.log("ensureWhatsAppWidget called. checking container...");
  try {
    if (document.querySelector(".wa-widget-container")) {
      console.log("container already exists. aborting.");
      return;
    }
    if (!document.body) {
      console.warn("document.body is null, waiting for DOMContentLoaded...");
      document.addEventListener("DOMContentLoaded", ensureWhatsAppWidget);
      return;
    }

    const container = document.createElement("div");
    container.className = "wa-widget-container";

    const cfg = window.DropCarsConfig || window.DROP_CARS_CONFIG;
    const waNumber =
      (cfg && cfg.company && cfg.company.functional_whatsapp) ? String(cfg.company.functional_whatsapp) : ((cfg && cfg.company && cfg.company.whatsapp) ? String(cfg.company.whatsapp) : "917200217986");
    const phone =
      (cfg && cfg.company && cfg.company.functional_phone) ? String(cfg.company.functional_phone) : ((cfg && cfg.company && cfg.company.phone) ? String(cfg.company.phone) : "7200217986");

    const isThankYouPage = window.location.pathname.includes("thank-you.php");

    function computeDefaultMsg() {
      if (isThankYouPage) {
        const params = new URLSearchParams(window.location.search);
        const bId = params.get("booking_id") || "-";
        return `Hello Drop Cars Team! 👋\nI would like to check the Status of my Booking.\n\n• Booking ID: ${bId}`;
      }

      try {
        const pickupInput = document.querySelector('input[name="pickup"]') || document.getElementById("pickup");
        const dropInput = document.querySelector('input[name="drop"]') || document.getElementById("drop");
        const dateInput = document.querySelector('input[name="date"]') || document.getElementById("pickup-date");
        const timeInput = document.querySelector('input[name="time"]') || document.getElementById("pickup-time");
        const nameInput = document.querySelector('input[name="customerName"]') || document.getElementById("contact-name");

        const pickupVal = (pickupInput ? pickupInput.value : "").trim();
        const dropVal = (dropInput ? dropInput.value : "").trim();
        const dateVal = (dateInput ? dateInput.value : "").trim();
        const timeVal = (timeInput ? timeInput.value : "").trim();
        const nameVal = (nameInput ? nameInput.value : "").trim();

        // Extract vehicle & fare from DropCarsState or DOM
        const state = window.DropCarsState;
        let vehicleType = (document.getElementById("vehicle-type-input") || {}).value || "";
        let fareAmount = 0;

        if (state && state.pendingSelection) {
          if (state.pendingSelection.vehicleType) vehicleType = state.pendingSelection.vehicleType;
          if (state.pendingSelection.finalFare && Number(state.pendingSelection.finalFare) > 0) {
            fareAmount = Number(state.pendingSelection.finalFare);
          }
        }

        if (!fareAmount) {
          const badge = document.querySelector(".confirm-btn-price-badge");
          if (badge && badge.textContent) {
            const num = parseInt(badge.textContent.replace(/\D/g, ""), 10);
            if (num > 0) fareAmount = num;
          }
        }

        const vehicleLabel = vehicleType
          ? vehicleType.replace(/_/g, " ").replace(/\bplus\b/gi, "+").replace(/\s+/g, " ").trim()
          : "Sedan";

        // 1. IF form values (Pickup & Drop) ARE generated/filled:
        if (pickupVal && dropVal) {
          let lines = [
            "Hi Drop Cars Team! 👋 I would like to book a cab:",
            `• Pickup: ${pickupVal}`,
            `• Drop: ${dropVal}`
          ];
          if (nameVal) {
            lines.push(`• Name: ${nameVal}`);
          }
          if (dateVal) {
            lines.push(`• Travel Date: ${dateVal}${timeVal ? " at " + timeVal : ""}`);
          }
          if (vehicleLabel) {
            let vLine = `• Vehicle: ${vehicleLabel}`;
            if (fareAmount > 0) {
              vLine += ` (Estimated Fare: ₹${fareAmount.toLocaleString("en-IN")})`;
            }
            lines.push(vLine);
          }
          lines.push("\nCould you please confirm driver details & availability?");
          return lines.join("\n");
        }
      } catch (e) {}

      // 2. IF values are NOT generated/filled: generate polite inquiry question for staff based on page context
      const rawTitle = (document.title || "").split("|")[0].split("–")[0].trim();
      const pagePath = window.location.pathname.toLowerCase();

      if (pagePath.includes("airport")) {
        return "Hi Drop Cars Team! 👋 I have an inquiry regarding Airport Taxi transfer & rates. Could you please share pricing & availability?";
      } else if (pagePath.includes("services")) {
        return "Hi Drop Cars Team! 👋 I would like to inquire about your one-way & outstation cab services. Could you please provide details?";
      } else if (pagePath.includes("reviews") || pagePath.includes("contact")) {
        return "Hi Drop Cars Team! 👋 I would like to get a quick quote for an upcoming outstation trip. Could you please assist me?";
      } else if (rawTitle && rawTitle.length > 3) {
        return `Hi Drop Cars Team! 👋 I have an inquiry about cab booking for ${rawTitle}. Could you please share fare details & availability?`;
      }

      return "Hi Drop Cars Team! 👋 I have an inquiry regarding cab booking. Could you please share fare details & availability?";
    }

    let defaultMsg = computeDefaultMsg();

    container.innerHTML = `
      <div class="wa-chat-popup wa-popup-compact" id="wa-chat-popup">
        <div class="wa-popup-header">
          <div class="wa-popup-agent">
            <div class="wa-agent-avatar">🚕</div>
            <div class="wa-agent-info">
              <h4>Drop Cars WhatsApp</h4>
              <p><span class="wa-online-dot"></span> 24/7 Live Support</p>
            </div>
          </div>
          <button type="button" class="wa-popup-close" id="wa-popup-close" aria-label="Close chat popup">&times;</button>
        </div>
        <div class="wa-popup-body">
          <div class="wa-chat-bubble">
            <p>Hi there 👋 Chat directly on WhatsApp for instant booking & status!</p>
          </div>
        </div>
        <div class="wa-popup-footer">
          <textarea class="wa-input-box" id="wa-user-msg" rows="2" placeholder="Type message...">${defaultMsg}</textarea>
          <button type="button" class="wa-send-btn" id="wa-start-chat-btn">
            <svg viewBox="0 0 32 32"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.4.7 4.7 1.9 6.7L4 29l7.5-1.9A13 13 0 0 0 16 27c6.6 0 12-5.4 12-12S22.6 3 16 3Zm0 22.5c-2 0-4-.6-5.6-1.7l-.4-.2-4.4 1.1 1.2-4.3-.3-.4A10 10 0 1 1 26 15c0 5.5-4.5 10-10 10Zm6-7.4c-.3-.2-1.7-.8-2-.9s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.3-.4.2-.7.1-2-.8-3.2-2.6-3.4-3-.2-.3 0-.4.2-.6l.5-.6c.2-.2.2-.3.3-.5s0-.4 0-.6c0-.2-.7-1.8-1-2.5-.2-.6-.5-.6-.7-.6h-.6c-.2 0-.5.1-.7.3-.2.3-1 1-1 2.4s1 2.8 1.2 3.1c.1.2 2 3.3 5 4.6.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.1-1.4s-.3-.2-.6-.4Z"/></svg>
            Start WhatsApp Chat
          </button>
        </div>
      </div>
      <div class="wa-btn-row">
        <a href="tel:+91${phone}" class="wa-call-btn" aria-label="Call us" title="Call Drop Cars">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 16.92v4a1 1 0 0 1-1.09 1A19.91 19.91 0 0 1 2.08 3.09 1 1 0 0 1 3 2h4a1 1 0 0 1 1 .75 12.35 12.35 0 0 0 .7 2.22 1 1 0 0 1-.23 1L7.21 7.91a16 16 0 0 0 8.88 8.88l1.94-1.21a1 1 0 0 1 1-.06 12.35 12.35 0 0 0 2.22.7 1 1 0 0 1 .75 1.1z"/></svg>
        </a>
        <button type="button" class="wa-floating-btn" id="wa-toggle-btn" aria-label="Open WhatsApp Chat Popup" title="Chat with Drop Cars">
          <svg viewBox="0 0 32 32"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.4.7 4.7 1.9 6.7L4 29l7.5-1.9A13 13 0 0 0 16 27c6.6 0 12-5.4 12-12S22.6 3 16 3Zm0 22.5c-2 0-4-.6-5.6-1.7l-.4-.2-4.4 1.1 1.2-4.3-.3-.4A10 10 0 1 1 26 15c0 5.5-4.5 10-10 10Zm6-7.4c-.3-.2-1.7-.8-2-.9s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.3-.4.2-.7.1-2-.8-3.2-2.6-3.4-3-.2-.3 0-.4.2-.6l.5-.6c.2-.2.2-.3.3-.5s0-.4 0-.6c0-.2-.7-1.8-1-2.5-.2-.6-.5-.6-.7-.6h-.6c-.2 0-.5.1-.7.3-.2.3-1 1-1 2.4s1 2.8 1.2 3.1c.1.2 2 3.3 5 4.6.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.1-1.4s-.3-.2-.6-.4Z"/></svg>
        </button>
        <button type="button" class="wa-ai-btn" id="wa-ai-toggle-btn" aria-label="Ask Drop Cars AI Assistant" title="Drop Cars AI Assistant">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L14.5 8.5L21 11L14.5 13.5L12 20L9.5 13.5L3 11L9.5 8.5L12 2Z"/>
            <path d="M5 2L6.25 5.25L9.5 6.5L6.25 7.75L5 11L3.75 7.75L0.5 6.5L3.75 5.25L5 2Z" opacity="0.75"/>
            <path d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z" opacity="0.85"/>
          </svg>
          <span class="wa-ai-badge">AI</span>
        </button>
      </div>
    `;

    document.body.appendChild(container);

    const toggleBtn = document.getElementById("wa-toggle-btn");
    const aiToggleBtn = document.getElementById("wa-ai-toggle-btn");
    const popup = document.getElementById("wa-chat-popup");
    const closeBtn = document.getElementById("wa-popup-close");
    const startChatBtn = document.getElementById("wa-start-chat-btn");
    const userMsgInput = document.getElementById("wa-user-msg");

    let userEditedMsg = false;
    if (userMsgInput) {
      userMsgInput.addEventListener("input", function () {
        userEditedMsg = true;
      });
    }

    function openPopup(aiMode) {
      if (popup) {
        if (aiMode && userMsgInput) {
          userMsgInput.value = "Hi Drop Cars AI 🤖 I need help calculating my cab fare and best vehicle option.";
        } else if (userMsgInput && !userEditedMsg) {
          userMsgInput.value = computeDefaultMsg();
        }
        popup.classList.add("is-open");
        if (userMsgInput) {
          setTimeout(function() { userMsgInput.focus(); }, 150);
        }
      }
    }

    function closePopup() {
      if (popup) popup.classList.remove("is-open");
    }

    if (toggleBtn) {
      toggleBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (window.DropCarsAI && typeof window.DropCarsAI.close === 'function') {
          window.DropCarsAI.close();
        }
        if (popup && popup.classList.contains("is-open")) {
          closePopup();
        } else {
          openPopup(false);
        }
      });
    }

    if (aiToggleBtn) {
      aiToggleBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (popup && popup.classList.contains("is-open")) {
          closePopup();
        }
        if (window.DropCarsAI && typeof window.DropCarsAI.toggle === 'function') {
          window.DropCarsAI.toggle();
        } else {
          const aiWin = document.getElementById('dc-ai-window');
          if (aiWin) {
            aiWin.classList.toggle('dc-ai-open');
          } else {
            document.dispatchEvent(new CustomEvent('dropcars:toggle-ai'));
          }
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        closePopup();
      });
    }

    function launchWhatsApp() {
      const msg = userMsgInput ? userMsgInput.value.trim() : defaultMsg;
      const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg || defaultMsg)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      closePopup();
    }

    if (startChatBtn) {
      startChatBtn.addEventListener("click", function(e) {
        e.preventDefault();
        launchWhatsApp();
      });
    }

    if (userMsgInput) {
      userMsgInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          launchWhatsApp();
        }
      });
    }

    // Touch and Click Outside Dismiss Listener
    function handleWaOutsideInteraction(e) {
      if (popup && popup.classList.contains("is-open") && !container.contains(e.target)) {
        closePopup();
      }
    }

    document.addEventListener("click", handleWaOutsideInteraction, true);
    document.addEventListener("touchstart", handleWaOutsideInteraction, { passive: true, capture: true });
    document.addEventListener("pointerdown", handleWaOutsideInteraction, { passive: true, capture: true });

  } catch (err) {
    console.error("Error in ensureWhatsAppWidget:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ensureWhatsAppWidget);
} else {
  ensureWhatsAppWidget();
}

/* ---- WhatsApp OR WhatsApp Business -------------------------------------------------------------------------------------------------
   An https wa.me / api.whatsapp.com link is claimed by the regular WhatsApp on Android, so a phone with WhatsApp Business never opened it.
   On Android we turn those links into an intent://send?... link (scheme whatsapp, no package pinned): Chrome then lets the phone's own
   "Open with" chooser pick WhatsApp or WhatsApp Business, and falls back to the https link when neither is installed. Desktop / iOS unchanged. */
(function () {
  if (window.__dcWaChooser) return;
  window.__dcWaChooser = true;
  if (!/Android/i.test(navigator.userAgent || "")) return;
  var RE = /^https?:\/\/(?:wa\.me\/(\d*)|api\.whatsapp\.com\/send)(?:\?(.*))?$/i;
  function toIntent(url) {
    var m = String(url || "").match(RE);
    if (!m) return null;
    var q = m[2] || "";
    var phone = m[1] || ((q.match(/(?:^|&)phone=(\d+)/) || [])[1] || "");
    var text = (q.match(/(?:^|&)text=([^&]*)/) || [])[1];
    var qs = (phone ? "phone=" + phone : "") + (phone && text ? "&" : "") + (text ? "text=" + text : "");
    return "intent://send?" + qs + "#Intent;scheme=whatsapp;S.browser_fallback_url=" + encodeURIComponent(url) + ";end";
  }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var intent = toIntent(a.getAttribute("href"));
    if (intent) {
      e.preventDefault();
      window.location.href = intent;
    }
  }, true);
  var nativeOpen = window.open;
  window.open = function (url) {
    var intent = typeof url === "string" ? toIntent(url) : null;
    if (intent) {
      window.location.href = intent;
      return null;
    }
    return nativeOpen.apply(window, arguments);
  };
})();
