/**
 * Drop Cars - Configurable Location Picker Engine
 * Integrates local city search (/data/cities.json), browser GPS snapping,
 * recent selection history, and OpenStreetMap Nominatim proxy with Google Maps fallback.
 *
 * Configurable via Admin Settings -> Google Maps & Location Picker.
 * Guaranteed Fail-Safe: Errors are handled silently without interrupting booking flow.
 */
(function () {
  "use strict";

  if (typeof window !== "undefined") {
    window.locationPickerBound = true;
  }

  try {
    function getUxConfig(key, defaultVal) {
      if (typeof window !== "undefined") {
        var cfg = window.DROP_CARS_UX || window.DropCarsUxConfig || window.DropCarsUx || {};
        if (cfg[key] !== undefined) {
          return cfg[key];
        }
      }
      return defaultVal !== undefined ? defaultVal : true;
    }

    var activeInput = null;
    var activeFieldKey = "";
    var dropdownEl = null;
    var debounceTimer = null;

    // Shared per-query geocode fetch cache (in-memory, per page load). Both
    // the automatic background lookup (fires while typing) and the manual
    // "Search maps for..." click fallback hit the same /api/geocode.php
    // endpoint for the same text - previously each fired its own independent
    // request, doubling API cost and making the manual click feel slow even
    // when the background call had already resolved (or was still pending).
    // Now they share one in-flight/resolved Promise per normalized query.
    var geocodeFetchCache = {};
    var googlePlacesService = null;
    function getGooglePlacesService() {
      if (!googlePlacesService && window.google && window.google.maps && window.google.maps.places) {
        try {
          googlePlacesService = new window.google.maps.places.AutocompleteService();
        } catch (e) {}
      }
      return googlePlacesService;
    }

    function fetchGeocodeCached(q) {
      var key = (q || "").toLowerCase().trim();
      if (!geocodeFetchCache[key]) {
        geocodeFetchCache[key] = new Promise(function (resolve) {
          var service = getGooglePlacesService();
          if (service) {
            service.getPlacePredictions({
              input: q,
              componentRestrictions: { country: 'in' }
            }, function (predictions, status) {
              var isOk = status === (window.google && window.google.maps && window.google.maps.places ? window.google.maps.places.PlacesServiceStatus.OK : 'OK');
              if (isOk && Array.isArray(predictions) && predictions.length > 0) {
                var results = predictions.map(function (p) {
                  var primary = p.structured_formatting ? p.structured_formatting.main_text : p.description;
                  var secondary = p.structured_formatting ? p.structured_formatting.secondary_text : '';
                  var fullDisplay = secondary ? (primary + ", " + secondary.replace(/,\s*India$/i, '')) : p.description.replace(/,\s*India$/i, '');
                  var state = '';
                  var fLower = fullDisplay.toLowerCase();
                  if (fLower.indexOf('tamil nadu') !== -1 || fLower.indexOf('puducherry') !== -1 || fLower.indexOf('pondicherry') !== -1) {
                    state = 'tamil nadu';
                  } else if (fLower.indexOf('karnataka') !== -1) {
                    state = 'karnataka';
                  } else if (fLower.indexOf('kerala') !== -1) {
                    state = 'kerala';
                  } else if (fLower.indexOf('andhra') !== -1) {
                    state = 'andhra pradesh';
                  } else if (fLower.indexOf('telangana') !== -1) {
                    state = 'telangana';
                  }
                  return {
                    display_name: fullDisplay,
                    place_id: p.place_id,
                    state: state,
                    source: 'google'
                  };
                });
                resolve(results);
              } else {
                fetch("/api/geocode.php?q=" + encodeURIComponent(q))
                  .then(function (r) { return r.json(); })
                  .then(resolve)
                  .catch(function () { resolve([]); });
              }
            });
          } else {
            fetch("/api/geocode.php?q=" + encodeURIComponent(q))
              .then(function (r) { return r.json(); })
              .then(resolve)
              .catch(function () { resolve([]); });
          }
        });
      }
      return geocodeFetchCache[key];
    }

    // Track physical user interaction to prevent browser form restoration/autofill from auto-opening dropdowns on load/refresh
    var userHasInteracted = false;
    function markUserInteracted() {
      userHasInteracted = true;
    }
    document.addEventListener("mousedown", markUserInteracted, true);
    document.addEventListener("touchstart", markUserInteracted, true);
    document.addEventListener("pointerdown", markUserInteracted, true);
    document.addEventListener("keydown", markUserInteracted, true);

    function getRecentSelections() {
      try {
        var saved = localStorage.getItem("dropcars_recent_locations");
        if (!saved) return [];
        var list = JSON.parse(saved);
        if (!Array.isArray(list)) return [];

        // Clean out invalid / raw unverified custom items (like "Tiruvsnnsmsksi")
        return list.filter(function (r) {
          if (!r || !r.display_name || r.isCustom || r.source === "custom") return false;
          var name = (r.display_name || "").trim();
          if (name.length < 3) return false;
          // Must have a state/city comma or be a verified city/airport
          if (name.indexOf(',') === -1) {
            var isKnown = (citiesList || []).some(function (c) {
              return (c.city || "").toLowerCase().indexOf(name.toLowerCase()) !== -1;
            });
            if (!isKnown) return false;
          }
          return true;
        });
      } catch (e) {
        return [];
      }
    }

    function saveToRecent(item) {
      try {
        if (!item || item.isGps || !item.display_name || item.isCustom || item.source === "custom") return;

        var name = (item.display_name || "").trim();
        if (name.length < 3) return;

        var recents = getRecentSelections();
        var filtered = recents.filter(function (r) {
          return (r.display_name || "").toLowerCase().trim() !== name.toLowerCase().trim();
        });
        filtered.unshift({
          display_name: name,
          lat: item.lat || null,
          lng: item.lng || null,
          state: item.state || "",
          isAirport: !!item.isAirport,
          source: "recent"
        });
        localStorage.setItem("dropcars_recent_locations", JSON.stringify(filtered.slice(0, 5)));
      } catch (e) { }
    }

    var DEFAULT_SOUTH_INDIA_CITIES = [
      { city: "Chennai Central Railway Station (Puratchi Thalaivar Dr. M.G.R. Central)", state: "Tamil Nadu", aliases: ["chennai central", "chennai centr", "central station", "mas", "chennai mas"] },
      { city: "Chennai Egmore Railway Station", state: "Tamil Nadu", aliases: ["chennai egmore", "egmore station", "ms"] },
      { city: "Chennai", state: "Tamil Nadu", aliases: ["chennai", "madras", "maa"] },
      { city: "Coimbatore Junction Railway Station", state: "Tamil Nadu", aliases: ["coimbatore junction", "cbe"] },
      { city: "Coimbatore", state: "Tamil Nadu", aliases: ["coimbatore", "kovai", "cjb"] },
      { city: "Madurai Junction Railway Station", state: "Tamil Nadu", aliases: ["madurai junction", "mdu"] },
      { city: "Madurai", state: "Tamil Nadu", aliases: ["madurai", "ixm"] },
      { city: "Trichy Junction (Tiruchirappalli Central)", state: "Tamil Nadu", aliases: ["trichy central", "trichy junction", "tpj", "trz"] },
      { city: "Trichy (Tiruchirappalli)", state: "Tamil Nadu", aliases: ["trichy", "tiruchirappalli", "tiruchirapalli", "trz"] },
      { city: "Salem Junction Railway Station", state: "Tamil Nadu", aliases: ["salem junction", "salem station", "sxv"] },
      { city: "Salem", state: "Tamil Nadu", aliases: ["salem", "sxv"] },
      { city: "KSR Bengaluru City Railway Station (Bangalore Central)", state: "Karnataka", aliases: ["bangalore central", "ksr bengaluru", "sbc", "bangalore city station"] },
      { city: "Bangalore (Bengaluru)", state: "Karnataka", aliases: ["bangalore", "bengaluru", "blr"] },
      { city: "Bull Temple Road, Bangalore", state: "Karnataka", aliases: ["bull", "bull temple", "bull temple road", "basavanagudi"] },
      { city: "Ayanavaram, Chennai", state: "Tamil Nadu", aliases: ["ayanavaram", "ayanavarm", "ayanavaram chennai"] },
      { city: "Nemmara (Nenmara / Nimmara)", state: "Kerala", aliases: ["nemmara", "nenmara", "nimmara", "nimara", "nemara", "palakkad"] },
      { city: "Palakkad (Palghat)", state: "Kerala", aliases: ["palakkad", "palghat"] },
      { city: "Thrissur (Trichur)", state: "Kerala", aliases: ["thrissur", "trichur"] },
      { city: "Kochi (Cochin / Ernakulam)", state: "Kerala", aliases: ["kochi", "cochin", "ernakulam", "cok"] },
      { city: "Trivandrum (Thiruvananthapuram)", state: "Kerala", aliases: ["trivandrum", "thiruvananthapuram", "trv"] },
      { city: "Calicut (Kozhikode)", state: "Kerala", aliases: ["calicut", "kozhikode", "ccj"] },
      { city: "Guruvayur", state: "Kerala", aliases: ["guruvayur"] },
      { city: "Munnar", state: "Kerala", aliases: ["munnar"] },
      { city: "Wayanad", state: "Kerala", aliases: ["wayanad", "kalpetta"] },
      { city: "Ooty (Udhagamandalam)", state: "Tamil Nadu", aliases: ["ooty", "ootacamund", "udhagamandalam"] },
      { city: "Kodaikanal", state: "Tamil Nadu", aliases: ["kodaikanal", "kodai"] },
      { city: "Yercaud", state: "Tamil Nadu", aliases: ["yercaud"] },
      { city: "Hosur", state: "Tamil Nadu", aliases: ["hosur"] },
      { city: "Krishnagiri", state: "Tamil Nadu", aliases: ["krishnagiri"] },
      { city: "Vellore", state: "Tamil Nadu", aliases: ["vellore", "katpadi"] },
      { city: "Tiruvannamalai", state: "Tamil Nadu", aliases: ["tiruvannamalai", "thiruvannamalai", "arunachala"], priority: 6 },
      { city: "Tirupati", state: "Andhra Pradesh", aliases: ["tirupati", "tirumala", "tir"] },
      { city: "Pondicherry (Puducherry)", state: "Tamil Nadu", aliases: ["pondicherry", "puducherry", "pondy"] },
      { city: "Thanjavur (Tanjore)", state: "Tamil Nadu", aliases: ["thanjavur", "tanjore"] },
      { city: "Kumbakonam", state: "Tamil Nadu", aliases: ["kumbakonam"] },
      { city: "Cuddalore", state: "Tamil Nadu", aliases: ["cuddalore"] },
      { city: "Chidambaram", state: "Tamil Nadu", aliases: ["chidambaram"] },
      { city: "Pollachi", state: "Tamil Nadu", aliases: ["pollachi"] },
      { city: "Tiruppur", state: "Tamil Nadu", aliases: ["tiruppur", "tirupur"] },
      { city: "Erode", state: "Tamil Nadu", aliases: ["erode"] },
      { city: "Karur", state: "Tamil Nadu", aliases: ["karur"] },
      { city: "Dindigul", state: "Tamil Nadu", aliases: ["dindigul"] },
      { city: "Theni", state: "Tamil Nadu", aliases: ["theni"] },
      { city: "Virudhunagar", state: "Tamil Nadu", aliases: ["virudhunagar"] },
      { city: "Sivakasi", state: "Tamil Nadu", aliases: ["sivakasi"] },
      { city: "Tenkasi", state: "Tamil Nadu", aliases: ["tenkasi"] },
      { city: "Tirunelveli", state: "Tamil Nadu", aliases: ["tirunelveli", "nellai"] },
      { city: "Tuticorin (Thoothukudi)", state: "Tamil Nadu", aliases: ["tuticorin", "thoothukudi"] },
      { city: "Kannur (Cannanore)", state: "Kerala", aliases: ["kannur", "cannanore", "cnn"] },
      { city: "Kannamangalam", state: "Tamil Nadu", aliases: ["kannamangalam", "kanamangalam", "vellore", "tiruvannamalai"] },
      { city: "Kanniyakumari (Kanyakumari)", state: "Tamil Nadu", aliases: ["kanniyakumari", "kanyakumari", "cape comorin"] },
      { city: "Velankanni", state: "Tamil Nadu", aliases: ["velankanni", "vailankanni"] },
      { city: "Kangeyam (Kangayam)", state: "Tamil Nadu", aliases: ["kangeyam", "kangayam", "kankeyam"] },
      { city: "Karaikal", state: "Puducherry", aliases: ["karaikal"] },
      { city: "Mayiladuthurai (Mayavaram)", state: "Tamil Nadu", aliases: ["mayiladuthurai", "mayavaram"] },
      { city: "Nagapattinam (Nagai)", state: "Tamil Nadu", aliases: ["nagapattinam", "nagai"] },
      { city: "Pudukkottai", state: "Tamil Nadu", aliases: ["pudukkottai", "pudukottai"] },
      { city: "Karaikudi", state: "Tamil Nadu", aliases: ["karaikudi"] },
      { city: "Ambur", state: "Tamil Nadu", aliases: ["ambur"] },
      { city: "Vaniyambadi", state: "Tamil Nadu", aliases: ["vaniyambadi"] },
      { city: "Tirupattur (Tirupathur)", state: "Tamil Nadu", aliases: ["tirupattur", "tirupathur"] },
      { city: "Arani (Arni)", state: "Tamil Nadu", aliases: ["arani", "arni"] },
      { city: "Cheyyar", state: "Tamil Nadu", aliases: ["cheyyar"] },
      { city: "Tindivanam", state: "Tamil Nadu", aliases: ["tindivanam"] },
      { city: "Gudiyatham (Gudiyattam)", state: "Tamil Nadu", aliases: ["gudiyatham", "gudiyattam"] },
      { city: "Ranipet", state: "Tamil Nadu", aliases: ["ranipet"] },
      { city: "Attur", state: "Tamil Nadu", aliases: ["attur"] },
      { city: "Mettur", state: "Tamil Nadu", aliases: ["mettur"] },
      { city: "Gobichettipalayam (Gobi)", state: "Tamil Nadu", aliases: ["gobichettipalayam", "gobi"] },
      { city: "Sathyamangalam (Sathy)", state: "Tamil Nadu", aliases: ["sathyamangalam", "sathy"] },
      { city: "Bhavani", state: "Tamil Nadu", aliases: ["bhavani"] },
      { city: "Dharapuram", state: "Tamil Nadu", aliases: ["dharapuram"] },
      { city: "Udumalaipettai (Udumalpet)", state: "Tamil Nadu", aliases: ["udumalaipettai", "udumalpet"] },
      { city: "Valparai", state: "Tamil Nadu", aliases: ["valparai"] },
      { city: "Rajapalayam", state: "Tamil Nadu", aliases: ["rajapalayam"] },
      { city: "Kovilpatti", state: "Tamil Nadu", aliases: ["kovilpatti"] },
      { city: "Tiruchendur", state: "Tamil Nadu", aliases: ["tiruchendur"] },
      { city: "Kollam (Quilon)", state: "Kerala", aliases: ["kollam", "quilon"] },
      { city: "Alappuzha (Alleppey)", state: "Kerala", aliases: ["alappuzha", "alleppey"] },
      { city: "Kottayam", state: "Kerala", aliases: ["kottayam"] },
      { city: "Kasaragod", state: "Kerala", aliases: ["kasaragod", "kasargod"] },
      { city: "Malappuram", state: "Kerala", aliases: ["malappuram"] },
      { city: "Manjeri", state: "Kerala", aliases: ["manjeri"] },
      { city: "Thalassery (Tellicherry)", state: "Kerala", aliases: ["thalassery", "tellicherry"] },
      { city: "Vadakara (Badagara)", state: "Kerala", aliases: ["vadakara", "badagara"] },
      { city: "Payyanur", state: "Kerala", aliases: ["payyanur"] },
      { city: "Kolar", state: "Karnataka", aliases: ["kolar"] },
      { city: "Chikkaballapur", state: "Karnataka", aliases: ["chikkaballapur"] },
      { city: "Mandya", state: "Karnataka", aliases: ["mandya"] },
      { city: "Hassan", state: "Karnataka", aliases: ["hassan"] },
      { city: "Shivamogga (Shimoga)", state: "Karnataka", aliases: ["shivamogga", "shimoga"] },
      { city: "Tumakuru (Tumkur)", state: "Karnataka", aliases: ["tumakuru", "tumkur"] },
      { city: "Mangaluru (Mangalore)", state: "Karnataka", aliases: ["mangaluru", "mangalore"] },
      { city: "Udupi", state: "Karnataka", aliases: ["udupi"] },
      { city: "Davanagere", state: "Karnataka", aliases: ["davanagere"] },
      { city: "Chengannur", state: "Kerala", aliases: ["chengannur", "chenganur", "chenganoor", "chengannoor"] },
      { city: "Changanassery (Changanacherry)", state: "Kerala", aliases: ["changanassery", "changanacherry"] },
      { city: "Thiruvalla (Tiruvalla)", state: "Kerala", aliases: ["thiruvalla", "tiruvalla"] },
      { city: "Kayamkulam", state: "Kerala", aliases: ["kayamkulam"] },
      { city: "Adoor (Adur)", state: "Kerala", aliases: ["adoor", "adur"] },
      { city: "Pathanamthitta", state: "Kerala", aliases: ["pathanamthitta"] },
      { city: "Kottarakkara", state: "Kerala", aliases: ["kottarakkara", "kottarakara"] },
      { city: "Attingal", state: "Kerala", aliases: ["attingal"] },
      { city: "Varkala", state: "Kerala", aliases: ["varkala"] },
      { city: "Angamaly", state: "Kerala", aliases: ["angamaly"] },
      { city: "Chalakkudy (Chalakudy)", state: "Kerala", aliases: ["chalakkudy", "chalakudy"] },
      { city: "Irinjalakuda", state: "Kerala", aliases: ["irinjalakuda"] },
      { city: "Muvattupuzha", state: "Kerala", aliases: ["muvattupuzha"] },
      { city: "Kothamangalam", state: "Kerala", aliases: ["kothamangalam"] },
      { city: "Perumbavoor", state: "Kerala", aliases: ["perumbavoor"] },
      { city: "Namagiripettai (Namakkal)", state: "Tamil Nadu", aliases: ["namagiri", "namagiripet", "namagiripettai"] },
      { city: "Mambalam, Chennai", state: "Tamil Nadu", aliases: ["mambalam", "west mambalam", "mambalam chennai"] },
      { city: "T. Nagar, Chennai", state: "Tamil Nadu", aliases: ["t nagar", "tnagar", "thyagaraya nagar"] },
      { city: "Velachery, Chennai", state: "Tamil Nadu", aliases: ["velachery", "velacheri"] },
      { city: "Guindy, Chennai", state: "Tamil Nadu", aliases: ["guindy"] },
      { city: "Adyar, Chennai", state: "Tamil Nadu", aliases: ["adyar"] },
      { city: "Mylapore, Chennai", state: "Tamil Nadu", aliases: ["mylapore"] },
      { city: "Anna Nagar, Chennai", state: "Tamil Nadu", aliases: ["anna nagar", "annanagar"] },
      { city: "Tambaram, Chennai", state: "Tamil Nadu", aliases: ["tambaram"] },
      { city: "Chromepet, Chennai", state: "Tamil Nadu", aliases: ["chromepet"] },
      { city: "Porur, Chennai", state: "Tamil Nadu", aliases: ["porur"] },
      { city: "Vadapalani, Chennai", state: "Tamil Nadu", aliases: ["vadapalani"] },
      { city: "K.K. Nagar, Chennai", state: "Tamil Nadu", aliases: ["kk nagar", "k k nagar"] },
      { city: "Ashok Nagar, Chennai", state: "Tamil Nadu", aliases: ["ashok nagar"] },
      { city: "Kodambakkam, Chennai", state: "Tamil Nadu", aliases: ["kodambakkam"] },
      { city: "Nungambakkam, Chennai", state: "Tamil Nadu", aliases: ["nungambakkam"] },
      { city: "Perambur, Chennai", state: "Tamil Nadu", aliases: ["perambur"] },
      { city: "Sholinganallur, Chennai", state: "Tamil Nadu", aliases: ["sholinganallur"] },
      { city: "Navalur, OMR, Chennai", state: "Tamil Nadu", aliases: ["navalur", "omr"] },
      { city: "Thiruvanmiyur, ECR, Chennai", state: "Tamil Nadu", aliases: ["thiruvanmiyur", "ecr"] },
      { city: "Koramangala, Bangalore", state: "Karnataka", aliases: ["koramangala"] },
      { city: "Indiranagar, Bangalore", state: "Karnataka", aliases: ["indiranagar"] },
      { city: "Whitefield, Bangalore", state: "Karnataka", aliases: ["whitefield"] },
      { city: "Electronic City, Bangalore", state: "Karnataka", aliases: ["electronic city", "ecity"] },
      { city: "Marathahalli, Bangalore", state: "Karnataka", aliases: ["marathahalli"] },
      { city: "Yelahanka, Bangalore", state: "Karnataka", aliases: ["yelahanka"] },
      { city: "Jayanagar, Bangalore", state: "Karnataka", aliases: ["jayanagar"] },
      { city: "Malleswaram, Bangalore", state: "Karnataka", aliases: ["malleswaram"] },
      { city: "Hebbal, Bangalore", state: "Karnataka", aliases: ["hebbal"] },
      { city: "HSR Layout, Bangalore", state: "Karnataka", aliases: ["hsr layout", "hsr"] },
      { city: "BTM Layout, Bangalore", state: "Karnataka", aliases: ["btm layout", "btm"] },
      { city: "Rajajinagar, Bangalore", state: "Karnataka", aliases: ["rajajinagar"] },
      { city: "Banashankari, Bangalore", state: "Karnataka", aliases: ["banashankari"] },
      { city: "Bellandur, Bangalore", state: "Karnataka", aliases: ["bellandur"] },
      { city: "Sarjapur, Bangalore", state: "Karnataka", aliases: ["sarjapur"] },
      { city: "Gandhipuram, Coimbatore", state: "Tamil Nadu", aliases: ["gandhipuram"] },
      { city: "R.S. Puram, Coimbatore", state: "Tamil Nadu", aliases: ["rs puram", "r s puram"] },
      { city: "Peelamedu, Coimbatore", state: "Tamil Nadu", aliases: ["peelamedu"] },
      { city: "Singanallur, Coimbatore", state: "Tamil Nadu", aliases: ["singanallur"] },
      { city: "Kilambakkam (KCBT Bus Terminus)", state: "Tamil Nadu", aliases: ["kilambakkam", "kcbt", "kalaignar bus terminus"] },
      { city: "Koyambedu (CMBT Bus Terminus)", state: "Tamil Nadu", aliases: ["koyambedu", "cmbt", "koyambedu bus stand"] },
      { city: "Madhavaram (Bus Terminus)", state: "Tamil Nadu", aliases: ["madhavaram", "madhavaram bus stand"] },
      { city: "Palani (Murugan Temple)", state: "Tamil Nadu", aliases: ["palani", "palani temple"] },
      { city: "Thiruchendur (Murugan Temple)", state: "Tamil Nadu", aliases: ["thiruchendur", "tiruchendur"] },
      { city: "Samayapuram (Mariamman Temple)", state: "Tamil Nadu", aliases: ["samayapuram"] },
      { city: "Chidambaram (Nataraja Temple)", state: "Tamil Nadu", aliases: ["chidambaram"] },
      { city: "Rameshwaram (Ramanathaswamy Temple)", state: "Tamil Nadu", aliases: ["rameshwaram", "rameswaram"] },
      { city: "Thanjavur (Big Temple / Brihadisvara)", state: "Tamil Nadu", aliases: ["thanjavur", "thanjavur big temple"] },
      { city: "Irungattukottai (SIPCOT Industrial Park)", state: "Tamil Nadu", aliases: ["irungattukottai", "irungattuko", "irungattukota", "irungattu", "sipcot irungattukottai"] },
      { city: "Oragadam (SIPCOT Industrial Hub)", state: "Tamil Nadu", aliases: ["oragadam", "oragadam sipcot"] },
      { city: "Vallam Vadagal (SIPCOT)", state: "Tamil Nadu", aliases: ["vallam vadagal", "vallam"] },
      { city: "Siruseri (SIPCOT IT Park)", state: "Tamil Nadu", aliases: ["siruseri", "siruseri IT park"] },
      { city: "TIDEL Park, Chennai", state: "Tamil Nadu", aliases: ["tidel park", "tidel"] },
      { city: "Mahabalipuram (Mamallapuram)", state: "Tamil Nadu", aliases: ["mahabalipuram", "mamallapuram", "ece"] },
      { city: "Sriperumbudur", state: "Tamil Nadu", aliases: ["sriperumbudur"] },
      { city: "Madurantakam", state: "Tamil Nadu", aliases: ["madurantakam"] },
      { city: "Uttiramerur", state: "Tamil Nadu", aliases: ["uttiramerur"] },
      { city: "Thiruporur", state: "Tamil Nadu", aliases: ["thiruporur"] },
      { city: "Kundrathur", state: "Tamil Nadu", aliases: ["kundrathur"] },
      { city: "Sunguvarchatram", state: "Tamil Nadu", aliases: ["sunguvarchatram"] },
      { city: "Tiruvallur", state: "Tamil Nadu", aliases: ["tiruvallur"] },
      { city: "Poonamallee, Chennai", state: "Tamil Nadu", aliases: ["poonamallee"] },
      { city: "Avadi, Chennai", state: "Tamil Nadu", aliases: ["avadi"] },
      { city: "Ambattur, Chennai", state: "Tamil Nadu", aliases: ["ambattur"] },
      { city: "Ponneri", state: "Tamil Nadu", aliases: ["ponneri"] },
      { city: "Gummidipoondi", state: "Tamil Nadu", aliases: ["gummidipoondi"] },
      { city: "Tiruttani", state: "Tamil Nadu", aliases: ["tiruttani"] },
      { city: "Uthukottai", state: "Tamil Nadu", aliases: ["uthukottai"] },
      { city: "Vengal", state: "Tamil Nadu", aliases: ["vengal"] },
      { city: "Arcot", state: "Tamil Nadu", aliases: ["arcot"] },
      { city: "Walajapet", state: "Tamil Nadu", aliases: ["walajapet"] },
      { city: "Sholinghur", state: "Tamil Nadu", aliases: ["sholinghur"] },
      { city: "Arakkonam", state: "Tamil Nadu", aliases: ["arakkonam"] },
      { city: "Yelagiri (Yelagiri Hills)", state: "Tamil Nadu", aliases: ["yelagiri", "yelagiri hills"] },
      { city: "Vandavasi", state: "Tamil Nadu", aliases: ["vandavasi"] },
      { city: "Polur", state: "Tamil Nadu", aliases: ["polur"] },
      { city: "Chengam", state: "Tamil Nadu", aliases: ["chengam"] },
      { city: "Gingee (Senji)", state: "Tamil Nadu", aliases: ["gingee", "senji"] },
      { city: "Vikravandi", state: "Tamil Nadu", aliases: ["vikravandi"] },
      { city: "Marakkanam", state: "Tamil Nadu", aliases: ["marakkanam"] },
      { city: "Kottakuppam", state: "Tamil Nadu", aliases: ["kottakuppam", "kottakupam"] },
      { city: "Kallakurichi", state: "Tamil Nadu", aliases: ["kallakurichi"] },
      { city: "Sankarapuram", state: "Tamil Nadu", aliases: ["sankarapuram"] },
      { city: "Tirukoilur", state: "Tamil Nadu", aliases: ["tirukoilur"] },
      { city: "Ulundurpet", state: "Tamil Nadu", aliases: ["ulundurpet"] },
      { city: "Chinnasalem", state: "Tamil Nadu", aliases: ["chinnasalem"] },
      { city: "Panruti", state: "Tamil Nadu", aliases: ["panruti"] },
      { city: "Vriddhachalam", state: "Tamil Nadu", aliases: ["vriddhachalam"] },
      { city: "Neyveli", state: "Tamil Nadu", aliases: ["neyveli"] },
      { city: "Sirkazhi", state: "Tamil Nadu", aliases: ["sirkazhi"] },
      { city: "Tharangambadi (Tranquebar)", state: "Tamil Nadu", aliases: ["tharangambadi", "tranquebar"] },
      { city: "Vedaranyam", state: "Tamil Nadu", aliases: ["vedaranyam"] },
      { city: "Pattukkottai", state: "Tamil Nadu", aliases: ["pattukkottai"] },
      { city: "Tiruvaiyaru", state: "Tamil Nadu", aliases: ["tiruvaiyaru"] },
      { city: "Swamimalai", state: "Tamil Nadu", aliases: ["swamimalai"] },
      { city: "Tiruvarur", state: "Tamil Nadu", aliases: ["tiruvarur"] },
      { city: "Mannargudi", state: "Tamil Nadu", aliases: ["mannargudi"] },
      { city: "Thiruthuraipoondi", state: "Tamil Nadu", aliases: ["thiruthuraipoondi"] },
      { city: "Aranthangi", state: "Tamil Nadu", aliases: ["aranthangi"] },
      { city: "Thirumayam", state: "Tamil Nadu", aliases: ["thirumayam"] },
      { city: "Srirangam, Trichy", state: "Tamil Nadu", aliases: ["srirangam"] },
      { city: "Lalgudi", state: "Tamil Nadu", aliases: ["lalgudi"] },
      { city: "Manapparai", state: "Tamil Nadu", aliases: ["manapparai"] },
      { city: "Musiri", state: "Tamil Nadu", aliases: ["musiri"] },
      { city: "Thuraiyur", state: "Tamil Nadu", aliases: ["thuraiyur"] },
      { city: "Jayankondam", state: "Tamil Nadu", aliases: ["jayankondam"] },
      { city: "Kulithalai", state: "Tamil Nadu", aliases: ["kulithalai"] },
      { city: "Rasipuram", state: "Tamil Nadu", aliases: ["rasipuram"] },
      { city: "Tiruchengode", state: "Tamil Nadu", aliases: ["tiruchengode"] },
      { city: "Paramathi Velur", state: "Tamil Nadu", aliases: ["paramathi velur", "p velur"] },
      { city: "Kolli Hills (Kolli Malai)", state: "Tamil Nadu", aliases: ["kolli hills", "kolli malai"] },
      { city: "Omalur", state: "Tamil Nadu", aliases: ["omalur"] },
      { city: "Sankari", state: "Tamil Nadu", aliases: ["sankari"] },
      { city: "Edappadi", state: "Tamil Nadu", aliases: ["edappadi"] },
      { city: "Harur", state: "Tamil Nadu", aliases: ["harur"] },
      { city: "Palacode", state: "Tamil Nadu", aliases: ["palacode"] },
      { city: "Pennagaram", state: "Tamil Nadu", aliases: ["pennagaram"] },
      { city: "Hogenakkal", state: "Tamil Nadu", aliases: ["hogenakkal"] },
      { city: "Denkanikottai", state: "Tamil Nadu", aliases: ["denkanikottai"] },
      { city: "Pochampalli", state: "Tamil Nadu", aliases: ["pochampalli"] },
      { city: "Uthangarai", state: "Tamil Nadu", aliases: ["uthangarai"] },
      { city: "Bargur", state: "Tamil Nadu", aliases: ["bargur"] },
      { city: "Shoolagiri", state: "Tamil Nadu", aliases: ["shoolagiri"] },
      { city: "Perundurai", state: "Tamil Nadu", aliases: ["perundurai"] },
      { city: "Palladam", state: "Tamil Nadu", aliases: ["palladam"] },
      { city: "Avinashi", state: "Tamil Nadu", aliases: ["avinashi"] },
      { city: "Mettupalayam", state: "Tamil Nadu", aliases: ["mettupalayam"] },
      { city: "Sulur", state: "Tamil Nadu", aliases: ["sulur"] },
      { city: "Coonoor", state: "Tamil Nadu", aliases: ["coonoor"] },
      { city: "Kotagiri", state: "Tamil Nadu", aliases: ["kotagiri"] },
      { city: "Gudalur", state: "Tamil Nadu", aliases: ["gudalur"] },
      { city: "Oddanchatram", state: "Tamil Nadu", aliases: ["oddanchatram"] },
      { city: "Batlagundu", state: "Tamil Nadu", aliases: ["batlagundu"] },
      { city: "Cumbum", state: "Tamil Nadu", aliases: ["cumbum"] },
      { city: "Periyakulam", state: "Tamil Nadu", aliases: ["periyakulam"] },
      { city: "Melur", state: "Tamil Nadu", aliases: ["melur"] },
      { city: "Thirumangalam", state: "Tamil Nadu", aliases: ["thirumangalam"] },
      { city: "Usilampatti", state: "Tamil Nadu", aliases: ["usilampatti"] },
      { city: "Thiruparankundram", state: "Tamil Nadu", aliases: ["thiruparankundram"] },
      { city: "Manamadurai", state: "Tamil Nadu", aliases: ["manamadurai"] },
      { city: "Kilakarai", state: "Tamil Nadu", aliases: ["kilakarai"] },
      { city: "Sattur", state: "Tamil Nadu", aliases: ["sattur"] },
      { city: "Srivilliputhur", state: "Tamil Nadu", aliases: ["srivilliputhur"] },
      { city: "Courtallam (Kuttralam)", state: "Tamil Nadu", aliases: ["courtallam", "kuttralam"] },
      { city: "Kadayanallur", state: "Tamil Nadu", aliases: ["kadayanallur"] },
      { city: "Puliyangudi", state: "Tamil Nadu", aliases: ["puliyangudi"] },
      { city: "Valliyur", state: "Tamil Nadu", aliases: ["valliyur"] },
      { city: "Kayalpattinam", state: "Tamil Nadu", aliases: ["kayalpattinam"] },
      { city: "Colachel", state: "Tamil Nadu", aliases: ["colachel"] },
      { city: "Auroville, Pondicherry", state: "Tamil Nadu / Puducherry", aliases: ["auroville"] },
      { city: "Chikkamagaluru (Chikmagalur)", state: "Karnataka", aliases: ["chikkamagaluru", "chikmagalur", "chikaman", "chikmagaluru", "chickmagalur", "chikmangalur"] },
      { city: "Coorg (Madikeri)", state: "Karnataka", aliases: ["coorg", "madikeri"] },
      { city: "Sakleshpur", state: "Karnataka", aliases: ["sakleshpur"] },
      { city: "Kabini", state: "Karnataka", aliases: ["kabini"] },
      { city: "Bandipur", state: "Karnataka", aliases: ["bandipur"] },
      { city: "Gokarna", state: "Karnataka", aliases: ["gokarna"] },
      { city: "Dandeli", state: "Karnataka", aliases: ["dandeli"] },
      { city: "Murudeshwar", state: "Karnataka", aliases: ["murudeshwar"] },
      { city: "Sringeri", state: "Karnataka", aliases: ["sringeri"] },
      { city: "Horanadu", state: "Karnataka", aliases: ["horanadu"] },
      { city: "Dharmasthala", state: "Karnataka", aliases: ["dharmasthala"] },
      { city: "Subramanya (Kukke Subramanya)", state: "Karnataka", aliases: ["subramanya", "kukke"] },
      { city: "Belur", state: "Karnataka", aliases: ["belur"] },
      { city: "Halebidu (Halebeedu)", state: "Karnataka", aliases: ["halebidu", "halebid"] },
      { city: "Hampi (Hosapete)", state: "Karnataka", aliases: ["hampi", "hosapete", "hospet"] },
      { city: "Vedanthangal (Vedanthangal Bird Sanctuary)", state: "Tamil Nadu", aliases: ["vedanthangal", "vedan", "vedanthangal bird sanctuary"] },
      { city: "Pichavaram (Mangrove Forest)", state: "Tamil Nadu", aliases: ["pichavaram", "pitchavaram"] },
      { city: "Mudumalai (Tiger Reserve)", state: "Tamil Nadu", aliases: ["mudumalai"] },
      { city: "Anamalai (Topslip)", state: "Tamil Nadu", aliases: ["anamalai", "topslip"] },
      { city: "Pulicat (Pulicat Lake)", state: "Tamil Nadu", aliases: ["pulicat", "pazhaverkadu"] },
      { city: "Megamalai (Highwavys)", state: "Tamil Nadu", aliases: ["megamalai", "meghamalai"] },
      { city: "Siruvani (Siruvani Waterfalls)", state: "Tamil Nadu", aliases: ["siruvani"] },
      { city: "Hosur", state: "Tamil Nadu / Karnataka Border", aliases: ["hosur"] },
      { city: "Hyderabad", state: "Telangana", aliases: ["hyderabad", "secunderabad", "cyberabad", "hitec city"] },
      { city: "Secunderabad", state: "Telangana", aliases: ["secunderabad"] },
      { city: "Warangal", state: "Telangana", aliases: ["warangal"] },
      { city: "Guntur", state: "Andhra Pradesh", aliases: ["guntur"] },
      { city: "Vijayawada", state: "Andhra Pradesh", aliases: ["vijayawada", "bezawada"] },
      { city: "Visakhapatnam (Vizag)", state: "Andhra Pradesh", aliases: ["visakhapatnam", "vizag"] },
      { city: "Tirupati (Tirumala)", state: "Andhra Pradesh", aliases: ["tirupati", "tirumala"] },
      { city: "Chittoor", state: "Andhra Pradesh", aliases: ["chittoor"] },
      { city: "Nellore", state: "Andhra Pradesh", aliases: ["nellore"] },
      { city: "Ongole", state: "Andhra Pradesh", aliases: ["ongole"] },
      { city: "Kurnool", state: "Andhra Pradesh", aliases: ["kurnool"] },
      { city: "Anantapur", state: "Andhra Pradesh", aliases: ["anantapur"] },
      { city: "Kadapa (Cuddapah)", state: "Andhra Pradesh", aliases: ["kadapa", "cuddapah"] },
      { city: "Madanapalle", state: "Andhra Pradesh", aliases: ["madanapalle"] },
      { city: "Srikalahasti", state: "Andhra Pradesh", aliases: ["srikalahasti"] },
      { city: "Tada", state: "Andhra Pradesh", aliases: ["tada"] },
      { city: "Sullurpeta", state: "Andhra Pradesh", aliases: ["sullurpeta"] },
      { city: "Kakinada", state: "Andhra Pradesh", aliases: ["kakinada"] },
      { city: "Rajahmundry", state: "Andhra Pradesh", aliases: ["rajahmundry", "rajamahendravaram"] },
      { city: "Ballari (Bellary)", state: "Karnataka", aliases: ["bellary", "ballari"] },

      // Villages/small towns commonly searched but missing from the curated
      // list above (added on user report - "Ammapettai", "Neepathurai", "Naidumangalam", "Nellikuppam").
      { city: "Nellikuppam (Cuddalore)", state: "Tamil Nadu", aliases: ["nellikuppam", "nellik", "nelli", "neelikuppam", "neeli", "nellikup"], lat: 11.7709, lng: 79.6738 },
      { city: "Neepathurai (Chengam)", state: "Tamil Nadu", aliases: ["neepathurai", "neepa", "neepaturai", "nipathurai"], lat: 12.21225, lng: 78.69085 },
      { city: "Naidumangalam (Tiruvannamalai)", state: "Tamil Nadu", aliases: ["naidumangalam", "naiduma", "naidumanagalam", "nayudumangalam"], lat: 12.2965, lng: 79.1412 },
      { city: "Chengam (Tiruvannamalai)", state: "Tamil Nadu", aliases: ["chengam", "chenga", "cgm"], lat: 12.3056, lng: 78.7989 },
      { city: "Polur (Tiruvannamalai)", state: "Tamil Nadu", aliases: ["polur", "polur town"], lat: 12.5085, lng: 79.1278 },
      { city: "Arani (Tiruvannamalai)", state: "Tamil Nadu", aliases: ["arani", "arni"], lat: 12.6687, lng: 79.2842 },
      { city: "Vandavasi (Tiruvannamalai)", state: "Tamil Nadu", aliases: ["vandavasi", "wandiwash"], lat: 12.5019, lng: 79.6083 },
      { city: "Vettavalam (Tiruvannamalai)", state: "Tamil Nadu", aliases: ["vettavalam", "vetavalam"], lat: 12.1026, lng: 79.2558 },
      { city: "Kilpennathur (Tiruvannamalai)", state: "Tamil Nadu", aliases: ["kilpennathur", "keelpennathur"], lat: 12.2471, lng: 79.2274 },
      { city: "Kalasapakkam (Tiruvannamalai)", state: "Tamil Nadu", aliases: ["kalasapakkam"], lat: 12.3831, lng: 79.0833 },
      { city: "Ammapettai (Thanjavur)", state: "Tamil Nadu", aliases: ["ammapettai", "amapettai", "ammapetai"] },

      // --- Landmarks / attractions / temples / hills / falls / sanctuaries ---
      // Tagged type:"landmark" so they rank *below* the plain city/town entry
      // for the same place (e.g. searching "arunacha" shows the town
      // "Arunachala, Tiruvannamalai" first, then "Arunachala Hill" /
      // "Arunachaleswarar Temple" landmarks, per user spec). Businesses named
      // after a place (travel agencies, theatres, etc.) are lower priority
      // still and are not hardcoded here - they only ever appear via the live
      // remote map search fallback, tagged type:"business" there.
      { city: "Arunachala Hill (Annamalai Hill)", state: "Tamil Nadu", type: "landmark", aliases: ["arunachala hill", "annamalai hill", "arunachala"] },
      { city: "Arunachaleswarar Temple, Tiruvannamalai", state: "Tamil Nadu", type: "landmark", aliases: ["arunachaleswarar temple", "annamalaiyar temple", "arunachala temple"] },
      { city: "Meenakshi Amman Temple, Madurai", state: "Tamil Nadu", type: "landmark", aliases: ["meenakshi amman temple", "meenakshi temple"] },
      { city: "Brihadeeswarar Temple (Big Temple), Thanjavur", state: "Tamil Nadu", type: "landmark", aliases: ["brihadeeswarar temple", "big temple", "thanjavur big temple"] },
      { city: "Ramanathaswamy Temple, Rameshwaram", state: "Tamil Nadu", type: "landmark", aliases: ["ramanathaswamy temple", "rameshwaram temple"] },
      { city: "Murugan Temple, Palani", state: "Tamil Nadu", type: "landmark", aliases: ["palani murugan temple", "palani temple"] },
      { city: "Velankanni Church (Basilica of Our Lady of Health)", state: "Tamil Nadu", type: "landmark", aliases: ["velankanni church", "velankanni basilica"] },
      { city: "Guruvayur Temple", state: "Kerala", type: "landmark", aliases: ["guruvayur temple", "guruvayurappan temple"] },
      { city: "Sabarimala Temple", state: "Kerala", type: "landmark", aliases: ["sabarimala temple", "sabarimala"] },
      { city: "Padmanabhaswamy Temple, Trivandrum", state: "Kerala", type: "landmark", aliases: ["padmanabhaswamy temple"] },
      { city: "Kutralam Falls (Courtallam Falls)", state: "Tamil Nadu", type: "landmark", aliases: ["kutralam falls", "courtallam falls"] },
      { city: "Hogenakkal Falls", state: "Tamil Nadu", type: "landmark", aliases: ["hogenakkal falls"] },
      { city: "Athirappilly Falls", state: "Kerala", type: "landmark", aliases: ["athirappilly falls", "athirapally falls"] },
      { city: "Mudumalai Tiger Reserve", state: "Tamil Nadu", type: "landmark", aliases: ["mudumalai tiger reserve", "mudumalai sanctuary"] },
      { city: "Anamalai Tiger Reserve (Topslip)", state: "Tamil Nadu", type: "landmark", aliases: ["anamalai tiger reserve", "topslip"] },
      { city: "Vedanthangal Bird Sanctuary", state: "Tamil Nadu", type: "landmark", aliases: ["vedanthangal bird sanctuary", "vedanthangal sanctuary"] },
      { city: "Bandipur National Park", state: "Karnataka", type: "landmark", aliases: ["bandipur national park", "bandipur sanctuary"] },
      { city: "Kodaikanal Lake", state: "Tamil Nadu", type: "landmark", aliases: ["kodaikanal lake", "kodai lake"] },
      { city: "Ooty Lake", state: "Tamil Nadu", type: "landmark", aliases: ["ooty lake", "udhagamandalam lake"] },
      { city: "Marina Beach, Chennai", state: "Tamil Nadu", type: "landmark", aliases: ["marina beach"] },
      { city: "Shore Temple, Mahabalipuram", state: "Tamil Nadu", type: "landmark", aliases: ["shore temple", "mahabalipuram shore temple"] },
      { city: "Golden Temple (Sripuram), Vellore", state: "Tamil Nadu", type: "landmark", aliases: ["sripuram golden temple", "vellore golden temple"] },
      { city: "Belur Math / Hampi Group of Monuments", state: "Karnataka", type: "landmark", aliases: ["hampi monuments", "hampi ruins"] },
      { city: "Munnar Tea Gardens", state: "Kerala", type: "landmark", aliases: ["munnar tea gardens", "munnar tea estate"] }
    ];

    var citiesList = DEFAULT_SOUTH_INDIA_CITIES.slice();

    // Fetch full cities.json dataset asynchronously
    try {
      fetch("/data/cities.json")
        .then(function (r) { return r.json(); })
        .then(function (remoteCities) {
          if (Array.isArray(remoteCities) && remoteCities.length > 0) {
            remoteCities.forEach(function (rc) {
              var exists = citiesList.some(function (c) {
                return (c.city || "").toLowerCase().trim() === (rc.city || "").toLowerCase().trim();
              });
              if (!exists) {
                citiesList.push({
                  city: rc.city,
                  state: rc.state || "Tamil Nadu",
                  aliases: [rc.slug || rc.city.toLowerCase()]
                });
              }
            });
          }
        })
        .catch(function () { });
    } catch (e) { }

    // Fetch server-saved geocoded locations dataset asynchronously
    try {
      fetch("/data/geocode_cache.json")
        .then(function (r) { return r.json(); })
        .then(function (cacheData) {
          if (cacheData && typeof cacheData === "object") {
            Object.keys(cacheData).forEach(function (key) {
              var list = cacheData[key];
              if (Array.isArray(list)) {
                list.forEach(function (item) {
                  if (item && item.display_name) {
                    var cityName = item.display_name.split(',')[0].trim();
                    var exists = citiesList.some(function (c) {
                      return (c.city || "").toLowerCase().trim() === cityName.toLowerCase();
                    });
                    if (!exists) {
                      citiesList.push({
                        city: cityName,
                        state: item.state ? item.state.charAt(0).toUpperCase() + item.state.slice(1) : "South India",
                        aliases: [cityName.toLowerCase()],
                        lat: item.lat || null,
                        lng: item.lng || null
                      });
                    }
                  }
                });
              }
            });
          }
        })
        .catch(function () { });
    } catch (e) { }

    // Airport dataset (name/code/state + real coordinates) used both for the
    // "search airports" autocomplete matches and for GPS-to-airport snapping
    // (triggerGPS below). Small embedded fallback covers the case where the
    // /data/airports.json fetch hasn't resolved yet when the user starts typing.
    var airportsList = [
      { code: "MAA", name: "Chennai International Airport", city: "Chennai", state: "Tamil Nadu", lat: 12.9941, lng: 80.1709, aliases: ["chennai", "chennai airport", "maa"] },
      { code: "CJB", name: "Coimbatore International Airport", city: "Coimbatore", state: "Tamil Nadu", lat: 11.0300, lng: 77.0434, aliases: ["coimbatore", "coimbatore airport", "cjb"] },
      { code: "IXM", name: "Madurai International Airport", city: "Madurai", state: "Tamil Nadu", lat: 9.8345, lng: 78.0934, aliases: ["madurai", "madurai airport", "ixm"] },
      { code: "TRZ", name: "Trichy International Airport", city: "Trichy (Tiruchirappalli)", state: "Tamil Nadu", lat: 10.7654, lng: 78.7097, aliases: ["trichy", "tiruchirappalli", "trz"] },
      { code: "SXV", name: "Salem Airport", city: "Salem", state: "Tamil Nadu", lat: 11.7833, lng: 78.0728, aliases: ["salem", "salem airport", "sxv"] },
      { code: "BLR", name: "Kempegowda International Airport", city: "Bangalore", state: "Karnataka", lat: 13.1986, lng: 77.7066, aliases: ["bangalore", "bengaluru", "blr"] },
      { code: "HYD", name: "Rajiv Gandhi International Airport", city: "Hyderabad", state: "Telangana", lat: 17.2403, lng: 78.4294, aliases: ["hyderabad", "hyd"] },
      { code: "TIR", name: "Tirupati Airport", city: "Tirupati", state: "Andhra Pradesh", lat: 13.6325, lng: 79.5433, aliases: ["tirupati", "tir"] },
      { code: "COK", name: "Cochin International Airport", city: "Kochi", state: "Kerala", lat: 10.1520, lng: 76.4019, aliases: ["kochi", "cochin", "cok"] }
    ];

    try {
      fetch("/data/airports.json")
        .then(function (r) { return r.json(); })
        .then(function (remoteAirports) {
          if (Array.isArray(remoteAirports) && remoteAirports.length > 0) {
            airportsList = remoteAirports;
          }
        })
        .catch(function () { });
    } catch (e) { }

    // Spelling variants people type (Kempagowda / Bangalore / Trichy ...) folded to one form, so "kempagowda" finds
    // "Kempegowda International Airport" and "bangalore airport" matches the Bengaluru entry.
    function foldPlaceWords(t) {
      return String(t || "").toLowerCase()
        .replace(/(bangalore|bangaluru|bengalore|banglore)/g, "bengaluru")
        .replace(/(kempagowda|kempegouda|kempagouda|kempe\s?gowda|kempa\s?gowda)/g, "kempegowda")
        .replace(/(trichy|tiruchi|tiruchirapalli)/g, "tiruchirappalli")
        .replace(/(cochin)/g, "kochi")
        .replace(/(intl)/g, "international");
    }

    function airportWordMatches(word, fullTarget) {
      if (fullTarget.indexOf(word) !== -1) return true;
      if (word.length < 4) return false;
      var budget = word.length <= 5 ? 1 : (word.length <= 6 ? 2 : 3);
      var targetWords = fullTarget.split(/[^a-z0-9]+/);
      for (var i = 0; i < targetWords.length; i++) {
        var tw = targetWords[i];
        if (!tw) continue;
        if (levenshteinDistance(word, tw) <= budget || levenshteinDistance(word, tw.slice(0, word.length)) <= budget) return true;
      }
      return false;
    }

    function searchAirports(query) {
      var cleanQuery = foldPlaceWords((query || "").trim());
      if (!cleanQuery) return [];
      var words = cleanQuery.split(/\s+/).filter(Boolean);

      return airportsList.filter(function (a) {
        var name = (a.name || "").toLowerCase();
        var city = (a.city || "").toLowerCase();
        var code = (a.code || "").toLowerCase();
        var aliasesStr = (a.aliases || []).join(" ").toLowerCase();
        var fullTarget = foldPlaceWords(name + " " + city + " " + code + " " + aliasesStr);

        return words.every(function (w) {
          return airportWordMatches(w, fullTarget);
        });
      }).map(function (a) {
        return {
          display_name: a.name + ", " + a.city,
          lat: a.lat || null,
          lng: a.lng || null,
          state: (a.state || "").toLowerCase(),
          isAirport: true,
          iata: a.code,
          source: "airport"
        };
      });
    }

    // Haversine distance in km between two lat/lng points
    function distanceKm(lat1, lng1, lat2, lng2) {
      var R = 6371;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLng = (lng2 - lng1) * Math.PI / 180;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
        * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Returns the nearest airport if the given coordinates are within
    // AIRPORT_GPS_RADIUS_KM of it (i.e. the customer is physically at/near
    // that airport), otherwise null so the caller falls back to a normal
    // reverse-geocoded address.
    var AIRPORT_GPS_RADIUS_KM = 3;
    function getNearestAirport(lat, lng) {
      var nearest = null;
      var nearestDist = Infinity;
      airportsList.forEach(function (a) {
        if (!a.lat || !a.lng) return;
        var d = distanceKm(lat, lng, a.lat, a.lng);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = a;
        }
      });
      if (nearest && nearestDist <= AIRPORT_GPS_RADIUS_KM) {
        return nearest;
      }
      return null;
    }

    // Which field ("pickup" or "drop") is currently restricted to airport-only
    // results. Only meaningful for the Airport Transfer trip type - kept in
    // sync with ui-controls.js's swap button via the dropcars:trip_type_changed
    // event, which already carries {type, direction}.
    var isAirportPage = typeof window !== "undefined" && (
      window.location.pathname.indexOf("airport-transfer") !== -1 ||
      document.querySelector('form[data-trip-type="airport_transfer"]') !== null ||
      document.getElementById("airport-booking-form") !== null
    );
    var airportFieldKey = isAirportPage ? "pickup" : null;

    document.addEventListener("dropcars:trip_type_changed", function (e) {
      var detail = e.detail || {};
      if (detail.type === "airport_transfer") {
        airportFieldKey = detail.direction === "to_airport" ? "drop" : "pickup";
      } else if (isAirportPage) {
        // The airport-transfer page's own "Rental" sub-tab flips serviceType
        // to hourly_rental, but the trip still starts from the airport - keep
        // pickup airport-restricted instead of falling back to a full search.
        airportFieldKey = "pickup";
      } else {
        airportFieldKey = null;
      }
    });

    function isFieldRestrictedToAirports(inputEl, fieldKey) {
      if (!inputEl) return false;
      var dataAttr = inputEl.getAttribute("data-restrict-airports") || inputEl.getAttribute("data-airport-only");
      if (dataAttr === "true") return true;
      if (dataAttr === "false") return false;

      if (airportFieldKey !== null) {
        var key = fieldKey || inputEl.name || inputEl.id || "";
        return key === airportFieldKey;
      }
      return false;
    }

    // "Use Current Location" (GPS) only makes sense on the field representing
    // where the customer physically is right now: pickup (or hourly pickup),
    // or whichever field is airport-restricted (there GPS is used to find the
    // *nearest airport*, not the customer's own address - see
    // getNearestAirport()). The plain "drop" field is where they're going,
    // not where they are, so most users would never use GPS there - don't
    // offer it.
    function shouldOfferGpsOption(fieldKey) {
      if (fieldKey === "drop") {
        return isFieldRestrictedToAirports(activeInput, fieldKey);
      }
      return true;
    }

    // Levenshtein distance helper for fuzzy typo matching
    function levenshteinDistance(a, b) {
      if (a.length === 0) return b.length;
      if (b.length === 0) return a.length;
      var matrix = [];
      for (var i = 0; i <= b.length; i++) matrix[i] = [i];
      for (var j = 0; j <= a.length; j++) matrix[0][j] = j;
      for (var i = 1; i <= b.length; i++) {
        for (var j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
            );
          }
        }
      }
      return matrix[b.length][a.length];
    }

    // Local fuzzy search with typo tolerance (e.g. "kotkupm" -> "Kottakuppam")
    function localSearch(query) {
      if (!getUxConfig("enableLocalLocationFallback", true)) return [];
      var cleanQuery = query.toLowerCase().trim();
      if (!cleanQuery) return [];

      var normQ = cleanQuery.replace(/[aeiou\s\-\.\']/g, '').replace(/([a-z])\1+/g, '$1');
      var queryWords = cleanQuery.split(/\s+/).filter(Boolean);

      var matches = [];
      var matchedCitiesMap = {};

      citiesList.forEach(function (c) {
        var name = (c.city || "").toLowerCase();
        var state = (c.state || "").toLowerCase();
        var aliasesList = (c.aliases || []);
        var aliasesStr = aliasesList.join(" ").toLowerCase();
        var cityKey = name.trim();

        // 1. Exact or Substring Match
        if (name.indexOf(cleanQuery) !== -1 || state.indexOf(cleanQuery) !== -1 || aliasesStr.indexOf(cleanQuery) !== -1) {
          if (!matchedCitiesMap[cityKey]) {
            matchedCitiesMap[cityKey] = true;
            matches.push(c);
          }
          return;
        }

        // 1b. Multi-word AND match: every word in the query must be found somewhere
        if (queryWords.length > 1) {
          var fullTarget = name + " " + state + " " + aliasesStr;
          if (queryWords.every(function (w) { return fullTarget.indexOf(w) !== -1; })) {
            if (!matchedCitiesMap[cityKey]) {
              matchedCitiesMap[cityKey] = true;
              matches.push(c);
            }
            return;
          }
        }

        // 2. Consonant-Skeleton Match (e.g. "kotkupm" -> "ktkpm" matching "Kottakuppam")
        // Gated by: (a) first letter must match (a short generic skeleton like
        // "mpt" otherwise matches dozens of unrelated names - this is what
        // caused "ammapettai" to fuzzy-suggest "Usilampatti"/"Chromepet"),
        // and (b) the skeleton must be a real prefix of the target OR cover
        // most of it, not just appear anywhere inside a longer name.
        if (cleanQuery.length >= 4 && normQ.length >= 4 && cleanQuery[0] === name[0]) {
          var normName = name.replace(/[aeiou\s\-\.\']/g, '').replace(/([a-z])\1+/g, '$1');
          var normAliases = aliasesList.map(function (al) {
            return (al || "").toLowerCase().replace(/[aeiou\s\-\.\']/g, '').replace(/([a-z])\1+/g, '$1');
          });
          var skeletonHit = normName.indexOf(normQ) === 0 ||
            (normQ.length >= normName.length * 0.6 && normName.indexOf(normQ) !== -1);
          if (!skeletonHit) {
            skeletonHit = normAliases.some(function (na, idx) {
              return (aliasesList[idx] || "")[0] === cleanQuery[0] &&
                (na.indexOf(normQ) === 0 || (normQ.length >= na.length * 0.6 && na.indexOf(normQ) !== -1));
            });
          }
          if (skeletonHit) {
            if (!matchedCitiesMap[cityKey]) {
              matchedCitiesMap[cityKey] = true;
              c.isFuzzy = true;
              matches.push(c);
            }
            return;
          }
        }

        // 3. Levenshtein Distance Typo Match (First letter MUST match to avoid unrelated places)
        if (cleanQuery.length >= 4 && matches.length < 8) {
          var checkTargets = [name].concat(aliasesList);
          for (var k = 0; k < checkTargets.length; k++) {
            var targetWord = checkTargets[k].toLowerCase().trim();
            if (targetWord.length > 0 && targetWord[0] === cleanQuery[0] && Math.abs(targetWord.length - cleanQuery.length) <= 3) {
              // Tightened from 2/3 - at distance 2-3 a 6-letter query like
              // "chenai" was matching "Chengam"/"Cheyyar" (real but unrelated
              // towns that merely share a couple of letters), which is noise
              // rather than a helpful typo correction. 1 typo'd letter covers
              // the overwhelming majority of genuine misspellings.
              var maxDist = cleanQuery.length <= 7 ? 1 : 2;
              var dist = levenshteinDistance(cleanQuery, targetWord);
              if (dist <= maxDist) {
                if (!matchedCitiesMap[cityKey]) {
                  matchedCitiesMap[cityKey] = true;
                  c.isFuzzy = true;
                  matches.push(c);
                }
                break;
              }
            }
          }
        }
      });

      matches.sort(function (a, b) {
        var nameA = (a.city || "").toLowerCase();
        var nameB = (b.city || "").toLowerCase();
        var qLower = cleanQuery.toLowerCase();

        function getJsStateRank(st) {
          var s = (st || "").toLowerCase();
          if (s.indexOf("tamil nadu") !== -1 || s.indexOf("puducherry") !== -1 || s.indexOf("pondicherry") !== -1) return 1;
          if (s.indexOf("karnataka") !== -1 || s.indexOf("kerala") !== -1 || s.indexOf("andhra pradesh") !== -1 || s.indexOf("telangana") !== -1) return 2;
          return 3;
        }

        var rA = getJsStateRank(a.state);
        var rB = getJsStateRank(b.state);
        if (rA !== rB) return rA - rB;

        // 1. Direct city name OR alias starts with query (e.g. "Kannur"
        // starts with "kann", or "arunachala" alias on the Tiruvannamalai
        // entry starts with "arunacha") - name-prefix and alias-prefix are
        // treated as the same top tier so a place matched via alias doesn't
        // lose to a landmark matched via its literal name.
        var prefixA = nameA.indexOf(qLower) === 0 ||
          (a.aliases || []).some(function (al) { return (al || "").toLowerCase().indexOf(qLower) === 0; });
        var prefixB = nameB.indexOf(qLower) === 0 ||
          (b.aliases || []).some(function (al) { return (al || "").toLowerCase().indexOf(qLower) === 0; });
        if (prefixA && !prefixB) return -1;
        if (!prefixA && prefixB) return 1;

        // 1b. Type rank: plain places (cities/towns/villages) outrank named
        // landmarks/attractions for the same query, which in turn outrank
        // businesses (e.g. searching "arunacha" -> the town "Tiruvannamalai"
        // [alias "arunachala"] and the landmark "Arunachala Hill" both
        // surface at the top since both are prefix matches, but the town
        // sorts first; a travel-agency-style business match would sort last
        // of all, below both).
        function getTypeRank(c) {
          if (c.type === "landmark") return 2;
          if (c.type === "business") return 3;
          return 1;
        }
        var typeRankA = getTypeRank(a);
        var typeRankB = getTypeRank(b);
        if (typeRankA !== typeRankB) return typeRankA - typeRankB;

        // 2. Exact vs Fuzzy
        if (!a.isFuzzy && b.isFuzzy) return -1;
        if (a.isFuzzy && !b.isFuzzy) return 1;

        return (b.priority || 0) - (a.priority || 0);
      });

      return matches.slice(0, 10).map(function (c) {
        return {
          display_name: c.city + ", " + c.state,
          lat: c.lat || null,
          lng: c.lng || null,
          state: (c.state || "").toLowerCase(),
          source: "local",
          isFuzzy: !!c.isFuzzy,
          isLandmark: c.type === "landmark",
          type: c.type || "place"
        };
      });
    }

    // Dropdown UI Management
    function initDropdown() {
      if (dropdownEl) return;

      if (!document.getElementById("dropcars-location-picker-styles")) {
        var styleEl = document.createElement("style");
        styleEl.id = "dropcars-location-picker-styles";
        styleEl.textContent = `
          .pac-container {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
            height: 0 !important;
            opacity: 0 !important;
          }
          .dropcars-autocomplete-dropdown {
            position: absolute !important;
            background: #ffffff !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 12px !important;
            box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18), 0 4px 10px rgba(0, 0, 0, 0.08) !important;
            max-height: 280px !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            z-index: 9999999 !important;
            box-sizing: border-box !important;
            padding: 6px 0 !important;
            font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
          }
          [data-theme="dark"] .dropcars-autocomplete-dropdown,
          .dark-mode .dropcars-autocomplete-dropdown {
            background: #1e293b !important;
            border-color: #334155 !important;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5) !important;
          }
          .dropcars-autocomplete-item {
            padding: 10px 14px !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            border-bottom: 1px solid #f1f5f9 !important;
            font-size: 13.5px !important;
            transition: background-color 0.15s ease !important;
            color: #1e293b !important;
          }
          [data-theme="dark"] .dropcars-autocomplete-item,
          .dark-mode .dropcars-autocomplete-item {
            border-bottom-color: #334155 !important;
            color: #f1f5f9 !important;
          }
          .dropcars-autocomplete-item:last-child {
            border-bottom: none !important;
          }
          .dropcars-autocomplete-item:hover {
            background-color: #f1f5f9 !important;
          }
          [data-theme="dark"] .dropcars-autocomplete-item:hover,
          .dark-mode .dropcars-autocomplete-item:hover {
            background-color: #334155 !important;
          }
          .dropcars-autocomplete-item.is-gps {
            background-color: rgba(234, 67, 53, 0.05) !important;
            border-bottom: 1.5px solid rgba(234, 67, 53, 0.15) !important;
          }
          .dropcars-autocomplete-item.is-gps:hover {
            background-color: rgba(234, 67, 53, 0.1) !important;
          }
          [data-theme="dark"] .dropcars-autocomplete-item.is-gps,
          .dark-mode .dropcars-autocomplete-item.is-gps {
            background-color: rgba(234, 67, 53, 0.15) !important;
            border-bottom-color: rgba(234, 67, 53, 0.3) !important;
          }
        `;
        document.head.appendChild(styleEl);
      }

      dropdownEl = document.createElement("div");
      dropdownEl.className = "dropcars-autocomplete-dropdown";
      dropdownEl.style.display = "none";
      document.body.appendChild(dropdownEl);

      document.addEventListener("click", function (e) {
        if (activeInput && !activeInput.contains(e.target) && !dropdownEl.contains(e.target)) {
          hideDropdown();
        }
      });

      window.addEventListener("resize", requestDropdownPositionUpdate);
      window.addEventListener("scroll", requestDropdownPositionUpdate, true);
    }

    // rAF-throttled: scroll/resize can fire dozens of times per second, but
    // getBoundingClientRect() forces a layout read - coalesce to at most
    // once per animation frame instead of once per event.
    var dropdownPositionRaf = null;
    function requestDropdownPositionUpdate() {
      if (dropdownPositionRaf !== null) return;
      dropdownPositionRaf = requestAnimationFrame(function () {
        dropdownPositionRaf = null;
        updateDropdownPosition();
      });
    }

    function updateDropdownPosition() {
      if (!dropdownEl || !activeInput) return;
      if (dropdownEl.parentNode !== document.body) {
        document.body.appendChild(dropdownEl);
      }

      var rect = activeInput.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return;

      var scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      var scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;

      dropdownEl.style.position = "absolute";
      dropdownEl.style.top = (rect.bottom + scrollTop + 4) + "px";
      dropdownEl.style.left = (rect.left + scrollLeft) + "px";
      dropdownEl.style.width = Math.max(rect.width, 240) + "px";
      dropdownEl.style.zIndex = "9999999";
    }

    function showDropdown() {
      if (!dropdownEl || !activeInput || !userHasInteracted) return;
      dropdownEl.style.display = "block";
      document.documentElement.classList.add("dc-dropdown-active");
      updateDropdownPosition();
    }

    function hideDropdown() {
      if (dropdownEl) dropdownEl.style.display = "none";
      document.documentElement.classList.remove("dc-dropdown-active");
      activeInput = null;
      activeFieldKey = "";
    }

    // Shown inside a dropdown row when the "Search maps for ..." lookup returns
    // no results (or fails). Previously the caller silently fell back to
    // selectLocation(item) with the raw typed text, which looked exactly like a
    // real selection but had no city/state context and wasn't a verified
    // location. Now we say so clearly, and only let the raw text through if the
    // user explicitly opts in via "Use ... anyway".
    function showNoResultsRow(row, title, isNetworkError) {
      var msg = isNetworkError
        ? "Couldn't reach map search — check your connection"
        : 'No matching location found for "' + title + '"';
      row.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#dc2626; font-size:15px; width:18px; text-align:center; flex-shrink:0;"></i>' +
        '<div style="flex:1; min-width:0;">' +
        '<strong style="color:#dc2626; display:block; font-size:12.5px; font-weight:600; white-space:normal; line-height:1.3;">' + msg + '</strong>' +
        '<span data-use-raw="1" style="color:#2563eb; font-size:11.5px; display:block; font-weight:500; cursor:pointer; margin-top:2px;">Use "' + title + '" anyway &#10132;</span>' +
        '</div>';
      var useRawEl = row.querySelector("[data-use-raw]");
      if (useRawEl) {
        useRawEl.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          selectLocation({ display_name: title, isCustom: true, source: "custom" });
        });
      }
    }

    function renderDropdown(items) {
      if (!dropdownEl || !activeInput) return;
      dropdownEl.innerHTML = "";

      if (items.length === 0) {
        hideDropdown();
        return;
      }

      var isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-mode');

      items.forEach(function (item) {
        var row = document.createElement("div");
        row.className = "dropcars-autocomplete-item" + (item.isGps ? " is-gps" : "") + (item.isCustom ? " is-custom" : "");

        if (item.isSearching) {
          row.style.cursor = "default";
          row.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:#94a3b8; font-size:14px; width:18px; text-align:center; flex-shrink:0;"></i>' +
            '<div style="flex:1; min-width:0;"><span style="color:' + (isDark ? '#94a3b8' : '#64748b') + '; font-size:12.5px; display:block;">' + item.display_name + '</span></div>';
          dropdownEl.appendChild(row);
          return;
        }

        var iconHtml = '<i class="fa-solid fa-location-dot" style="color:#64748b; font-size:14px; width:18px; text-align:center; flex-shrink:0;"></i>';
        if (item.isGps) {
          iconHtml = '<i class="fa-solid fa-crosshairs" style="color:#ea4335; font-size:16px; width:18px; text-align:center; flex-shrink:0;"></i>';
        } else if (item.isAirport) {
          iconHtml = '<i class="fa-solid fa-plane-departure" style="color:#0ea5e9; font-size:15px; width:18px; text-align:center; flex-shrink:0;"></i>';
        } else if (item.isRecent) {
          iconHtml = '<i class="fa-solid fa-history" style="color:#ab47bc; font-size:14px; width:18px; text-align:center; flex-shrink:0;"></i>';
        } else if (item.isPopular) {
          iconHtml = '<i class="fa-solid fa-star" style="color:#f59e0b; font-size:13px; width:18px; text-align:center; flex-shrink:0;"></i>';
        } else if (item.isLandmark) {
          iconHtml = '<i class="fa-solid fa-landmark" style="color:#7c3aed; font-size:14px; width:18px; text-align:center; flex-shrink:0;"></i>';
        } else if (item.isFuzzy) {
          iconHtml = '<i class="fa-solid fa-spell-check" style="color:#16a34a; font-size:14px; width:18px; text-align:center; flex-shrink:0;"></i>';
        } else if (item.isCustom) {
          iconHtml = '<i class="fa-solid fa-magnifying-glass-location" style="color:#2563eb; font-size:16px; width:18px; text-align:center; flex-shrink:0;"></i>';
        } else if (item.isRawFallback) {
          iconHtml = '<i class="fa-solid fa-pen-to-square" style="color:#64748b; font-size:14px; width:18px; text-align:center; flex-shrink:0;"></i>';
        } else if (item.source === "google" || item.source === "nominatim" || item.source === "map") {
          iconHtml = '<i class="fa-solid fa-map-pin" style="color:#2563eb; font-size:14px; width:18px; text-align:center; flex-shrink:0;"></i>';
        }

        var title = item.display_name.split(',')[0];
        var subtitle = item.display_name.split(',').slice(1).join(',').trim();
        var titleColor = item.isGps ? '#ea4335' : (item.isCustom ? '#2563eb' : (isDark ? '#f8fafc' : '#1e293b'));
        var subColor = isDark ? '#94a3b8' : '#64748b';
        // Fuzzy/typo-corrected matches get a "Did you mean" prefix so it's
        // clear this isn't an exact match on what was typed.
        if (item.isFuzzy) {
          subtitle = subtitle ? ('Did you mean this? · ' + subtitle) : 'Did you mean this?';
        } else if (item.isRawFallback) {
          subtitle = 'Use "' + title + '" as typed';
        }

        var labelHtml = '<div style="flex:1; min-width:0;"><strong style="color:' + titleColor + '; display:block; font-size:13.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + (item.isCustom ? 'Search maps for "' + title + '"' : title) + '</strong>' +
          (subtitle ? '<span style="color:' + (item.isFuzzy ? '#16a34a' : subColor) + '; font-size:11.5px; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:' + (item.isFuzzy ? '600' : '400') + ';">' + subtitle + '</span>' : (item.isGps ? '<span style="color:' + subColor + '; font-size:11.5px; display:block;">Auto-detect via GPS</span>' : (item.isCustom ? '<span style="color:#2563eb; font-size:11.5px; display:block; font-weight:500;">Fetch related map locations online ➔</span>' : ''))) + '</div>';

        row.innerHTML = iconHtml + labelHtml;

        var handleRowSelect = function (e) {
          e.preventDefault();
          e.stopPropagation();

          if (item.isGps) {
            triggerGPS();
            return;
          }

          if (item.isCustom) {
            row.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:#2563eb; font-size:16px; width:18px; text-align:center; flex-shrink:0;"></i><div style="flex:1; min-width:0;"><strong style="color:#2563eb; display:block; font-size:13.5px; font-weight:600;">Searching maps for "' + title + '"...</strong><span style="color:#64748b; font-size:11.5px; display:block;">Fetching online map suggestions...</span></div>';

            var searchQ = title;
            var searchTN = (searchQ.toLowerCase().indexOf("tamil nadu") === -1) ? (searchQ + ", Tamil Nadu") : searchQ;

            function processAndShowSuggestions(resultsList) {
              if (Array.isArray(resultsList) && resultsList.length > 0) {
                var suggestionItems = [];
                resultsList.forEach(function (rItem) {
                  var exists = suggestionItems.some(function (s) {
                    return (s.display_name || "").toLowerCase().trim() === (rItem.display_name || "").toLowerCase().trim();
                  });
                  if (!exists) {
                    suggestionItems.push(rItem);
                  }
                });

                var formattedRaw = title.charAt(0).toUpperCase() + title.slice(1);
                var hasExactRaw = suggestionItems.some(function (s) {
                  return (s.display_name || "").toLowerCase().split(',')[0].trim() === title.toLowerCase().trim();
                });
                if (!hasExactRaw) {
                  suggestionItems.push({
                    display_name: formattedRaw,
                    isRawFallback: true,
                    source: "custom"
                  });
                }

                renderDropdown(suggestionItems);
              } else {
                showNoResultsRow(row, title, false);
              }
            }

            fetchGeocodeCached(searchTN)
              .then(function (remoteData) {
                if (Array.isArray(remoteData) && remoteData.length > 0) {
                  processAndShowSuggestions(remoteData);
                } else {
                  fetchGeocodeCached(title)
                    .then(function (fallbackData) {
                      processAndShowSuggestions(fallbackData);
                    })
                    .catch(function () {
                      showNoResultsRow(row, title, true);
                    });
                }
              })
              .catch(function () {
                fetchGeocodeCached(title)
                  .then(function (fallbackData) {
                    processAndShowSuggestions(fallbackData);
                  })
                  .catch(function () {
                    showNoResultsRow(row, title, true);
                  });
              });
            return;
          }

          selectLocation(item);
        };

        row.addEventListener("mousedown", handleRowSelect);
        row.addEventListener("click", handleRowSelect);
        dropdownEl.appendChild(row);
      });

      showDropdown();
    }

    function selectLocation(item) {
      if (!activeInput) return;

      var val = item.display_name || "";
      var itemState = item.state || "";

      // 1. Airports formatting: Airport Name, City, State
      if (item.isAirport || item.source === "airport") {
        var apObj = airportsList.find(function (a) {
          return (a.code || "").toLowerCase() === (item.iata || "").toLowerCase() ||
            (item.display_name || "").toLowerCase().indexOf((a.city || "").toLowerCase()) !== -1;
        });
        if (apObj) {
          val = apObj.name + ", " + apObj.city + ", " + apObj.state;
          itemState = apObj.state;
        } else {
          var apParts = val.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          if (apParts.length === 1) {
            val = apParts[0] + ", South India";
          } else if (apParts.length === 2 && !/\b(Tamil Nadu|Karnataka|Kerala|Andhra Pradesh|Telangana|Puducherry)\b/i.test(apParts[1])) {
            val = apParts[0] + ", " + apParts[1] + ", South India";
          }
        }
      } else if (val) {
        // 2. Normal Cities & Locations formatting:
        var parts = val.split(',').map(function (p) { return p.trim(); }).filter(Boolean);

        // If the location string already contains a state name, preserve the clean display name!
        var hasKnownState = parts.some(function (p) {
          return /\b(Tamil Nadu|Karnataka|Kerala|Andhra Pradesh|Telangana|Puducherry)\b/i.test(p);
        });

        if (hasKnownState && parts.length >= 2) {
          var statePart = parts.find(function (p) {
            return /\b(Tamil Nadu|Karnataka|Kerala|Andhra Pradesh|Telangana|Puducherry)\b/i.test(p);
          });
          itemState = statePart;

          if (parts.length > 3) {
            val = [parts[0], parts[parts.length - 2], parts[parts.length - 1]].join(', ');
          } else {
            val = parts.join(', ');
          }
        } else {
          // If no state is present in display_name, check if parts[0] EXACTLY matches a known city or alias
          var firstPartLower = parts[0].toLowerCase();

          var exactKnownEntry = citiesList.find(function (c) {
            var cCityLower = (c.city || "").toLowerCase().split(',')[0].trim();
            return cCityLower === firstPartLower ||
              (c.aliases || []).some(function (al) { return (al || "").toLowerCase() === firstPartLower; });
          });

          if (exactKnownEntry) {
            val = exactKnownEntry.city + (exactKnownEntry.city.toLowerCase().indexOf(exactKnownEntry.state.toLowerCase()) !== -1 ? "" : ", " + exactKnownEntry.state);
            itemState = exactKnownEntry.state;
          } else if (item.isCustom || item.source === "custom" || /\b(India)\b/i.test(parts[parts.length - 1])) {
            // NEVER append ", Tamil Nadu" onto custom/unverified strings or strings already ending in "India"!
            val = parts.join(', ');
            itemState = item.state || "";
          } else {
            // If it's a place/town without a state, append item.state or "Tamil Nadu" as fallback
            var st = item.state ? (item.state.charAt(0).toUpperCase() + item.state.slice(1)) : "Tamil Nadu";
            val = parts.join(', ') + ", " + st;
            itemState = st;
          }
        }
      }

      item.state = itemState || item.state;
      activeInput.value = val;
      saveToRecent(item);

      // Extract and save state for border toll detection
      if (item.state && getUxConfig("enableStateBorderDetection", true)) {
        window.DropCarsPlaceStates = window.DropCarsPlaceStates || {};
        window.DropCarsPlaceStates[activeFieldKey] = item.state.toLowerCase();
        document.dispatchEvent(new CustomEvent("dropcars:place_state_updated", {
          detail: { fieldKey: activeFieldKey, state: item.state }
        }));
      }

      // Save precise lat/lng if available
      if (item.lat && item.lng) {
        window.DropCarsPreciseCoords = window.DropCarsPreciseCoords || {};
        window.DropCarsPreciseCoords[activeFieldKey] = { lat: item.lat, lng: item.lng };
      }

      activeInput.dispatchEvent(new Event("input", { bubbles: true }));
      activeInput.dispatchEvent(new Event("change", { bubbles: true }));
      hideDropdown();
    }

    // Trigger Browser GPS Snapping
    function triggerGPS() {
      if (!navigator.geolocation) return;

      if (activeInput) {
        activeInput.placeholder = "Detecting your location...";
      }

      navigator.geolocation.getCurrentPosition(
        function (pos) {
          var lat = pos.coords.latitude;
          var lng = pos.coords.longitude;

          // If the customer is physically at/near a known airport, use the
          // airport name directly instead of whatever address reverse-geocoding
          // would return for that spot (a terminal building, cargo road, etc.).
          var nearestAirport = getNearestAirport(lat, lng);
          if (nearestAirport) {
            selectLocation({
              display_name: nearestAirport.name + ", " + nearestAirport.city,
              lat: lat,
              lng: lng,
              state: (nearestAirport.state || "").toLowerCase(),
              isAirport: true,
              iata: nearestAirport.code
            });
            if (activeInput) activeInput.placeholder = "";
            return;
          }

          fetch("/api/geocode.php?lat=" + lat + "&lng=" + lng)
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data && data.display_name) {
                data.lat = data.lat || lat;
                data.lng = data.lng || lng;
                selectLocation(data);
              }
            })
            .catch(function () { })
            .finally(function () {
              if (activeInput) activeInput.placeholder = "";
            });
        },
        function (err) {
          if (activeInput) activeInput.placeholder = "";
        },
        { timeout: 8000 }
      );
    }

    // Attach custom picker to input fields
    function attachLocationPicker(inputEl, fieldKey) {
      if (!inputEl || inputEl.dataset.locationPickerBound) return;
      inputEl.dataset.locationPickerBound = "true";

      initDropdown();

      inputEl.addEventListener("blur", function () {
        setTimeout(function () {
          if (activeInput === inputEl && document.activeElement !== inputEl) {
            hideDropdown();
          }
        }, 150);
      });

      function openLocationDropdownOnInteraction() {
        activeInput = inputEl;
        activeFieldKey = fieldKey;
        var restrictToAirports = isFieldRestrictedToAirports(inputEl, fieldKey);

        var items = [];

        // 1. Always prepend "Use Current Location" at the top (pickup-type fields only)
        if (getUxConfig("enableGpsCurrentLocation", true) && shouldOfferGpsOption(fieldKey)) {
          items.push({ display_name: "Use Current Location", isGps: true });
        }

        // 2. Add Recent Selections
        var recents = getRecentSelections();
        recents.forEach(function (r) {
          if (restrictToAirports && !r.isAirport) return;
          r.isRecent = true;
          items.push(r);
        });

        // 3. Add Popular Hubs when input is empty
        if (!inputEl.value.trim()) {
          if (restrictToAirports) {
            airportsList.forEach(function (a) {
              items.push({ display_name: a.name + ", " + a.city, lat: a.lat, lng: a.lng, state: (a.state || "").toLowerCase(), isAirport: true, iata: a.code, source: "airport" });
            });
          } else {
            // Popular/major destinations, ranked by the curated "priority" field
            // already present in cities.json (10 = top hub like Chennai/Bangalore,
            // down to lower-priority towns) rather than an arbitrary "first N
            // cities" or letter-match, so this reflects actual business priority.
            var popular = Array.isArray(citiesList)
              ? citiesList
                .slice()
                .sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); })
                .slice(0, 8)
                .map(function (c) {
                  return { display_name: c.city + ", " + c.state, lat: c.lat, lng: c.lng, state: (c.state || "").toLowerCase(), source: "local", isPopular: true };
                })
              : [];
            popular.forEach(function (p) { items.push(p); });
          }
        }

        renderDropdown(items);
      }

      inputEl.addEventListener("focus", function (e) {
        if (!userHasInteracted && (!e || !e.isTrusted)) return;
        userHasInteracted = true;
        openLocationDropdownOnInteraction();
      });

      inputEl.addEventListener("click", function (e) {
        userHasInteracted = true;
        openLocationDropdownOnInteraction();
      });

      inputEl.addEventListener("pointerdown", function (e) {
        userHasInteracted = true;
      });

      inputEl.addEventListener("input", function (e) {
        if (!userHasInteracted && (!e || !e.isTrusted)) return;
        userHasInteracted = true;
        activeInput = inputEl;
        activeFieldKey = fieldKey;
        var restrictToAirports = isFieldRestrictedToAirports(inputEl, fieldKey);

        var q = inputEl.value.trim();
        if (q.length < 1) {
          var items = [];
          if (getUxConfig("enableGpsCurrentLocation", true) && shouldOfferGpsOption(fieldKey)) {
            items.push({ display_name: "Use Current Location", isGps: true });
          }
          var recents = getRecentSelections();
          recents.forEach(function (r) {
            if (restrictToAirports && !r.isAirport) return;
            r.isRecent = true;
            items.push(r);
          });
          renderDropdown(items);
          return;
        }

        // Instant local results (0ms)
        var instantMatches = restrictToAirports ? searchAirports(q) : localSearch(q);

        var displayItems = [];
        if (getUxConfig("enableGpsCurrentLocation", true) && shouldOfferGpsOption(fieldKey)) {
          displayItems.push({ display_name: "Use Current Location", isGps: true });
        }
        displayItems = displayItems.concat(instantMatches);

        // Prepare custom "Search maps for..." fallback option
        var customOption = null;
        var hasExactMatch = displayItems.some(function (item) {
          return !item.isGps && (item.display_name || "").toLowerCase().split(',')[0].trim() === q.toLowerCase();
        });

        if (!hasExactMatch && q.length >= 3) {
          customOption = {
            display_name: q.charAt(0).toUpperCase() + q.slice(1),
            isCustom: true,
            source: "custom"
          };
        }

        // Render instant results (with customOption ALWAYS at the very bottom).
        // When local matches are thin, add a non-interactive "Searching..."
        // row automatically so the user sees a live lookup is happening
        // without needing to click "Search maps for..." first - that click
        // was firing a second, redundant network request on top of the
        // automatic background one below.
        function getLocationPriorityScore(item, query) {
          if (item.isGps) return 100000;
          if (item.isSearching) return -999;
          if (item.isCustom) return -1000;

          var name = (item.display_name || item.city || item.name || "").toLowerCase();
          var state = (item.state || "").toLowerCase();
          var qLower = (query || "").toLowerCase().trim();

          var isTN = state.indexOf("tamil nadu") !== -1 || state.indexOf("puducherry") !== -1 || state.indexOf("pondicherry") !== -1 || name.indexOf("tamil nadu") !== -1 || name.indexOf("puducherry") !== -1;
          var isSouthIndia = isTN || state.indexOf("karnataka") !== -1 || state.indexOf("kerala") !== -1 || state.indexOf("andhra") !== -1 || state.indexOf("telangana") !== -1;

          var isMainCity = (item.priority && item.priority >= 8) || item.isPopular;
          var primaryName = name.split(',')[0].trim();
          var isExactPrefix = primaryName.indexOf(qLower) === 0;

          // Tier 1: Main cities of Tamil Nadu (Always top priority)
          if (isTN && isMainCity) {
            return isExactPrefix ? 90000 : 80000;
          }
          // Tier 2: ALL other Tamil Nadu towns, cities & villages (ALWAYS OUTRANK OTHER STATES)
          if (isTN) {
            return isExactPrefix ? 70000 : 60000;
          }
          // Tier 3: Other South Indian states (Karnataka, AP, Kerala, Telangana)
          if (isSouthIndia) {
            return isExactPrefix ? 30000 : 20000;
          }
          // Tier 4: Rest of India
          return isExactPrefix ? 10000 : 5000;
        }

        function sortLocationsByPriority(list, query) {
          return list.slice().sort(function (a, b) {
            return getLocationPriorityScore(b, query) - getLocationPriorityScore(a, query);
          });
        }

        var willAutoFetch = q.length >= 3 && getUxConfig("enableOsmGeocodingProxy", true);
        var sortedDisplayItems = sortLocationsByPriority(displayItems, q);
        var initialList = [].concat(sortedDisplayItems);
        if (willAutoFetch && (instantMatches.length === 0 || instantMatches.length < 3)) {
          initialList.push({ display_name: "Searching maps for “" + q + "”…", isSearching: true });
        }
        if (customOption) {
          initialList.push(customOption);
        }
        renderDropdown(initialList);

        function isResultRelevant(query, displayName) {
          if (!query || !displayName) return false;
          var qLower = query.toLowerCase().trim();
          var dLower = displayName.toLowerCase().trim();
          if (dLower.indexOf(qLower) !== -1) return true;

          var qClean = qLower.replace(/[^a-z0-9]/g, '');
          var dClean = dLower.replace(/[^a-z0-9]/g, '');
          if (qClean.length >= 3 && dClean.indexOf(qClean.slice(0, 3)) !== -1) return true;

          var qWords = qLower.split(/\s+/).filter(Boolean);
          var dWords = dLower.replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(Boolean);

          return qWords.every(function (qw) {
            if (qw.length < 3) return true;
            return dWords.some(function (dw) {
              return dw.indexOf(qw) === 0 || qw.indexOf(dw) === 0;
            });
          });
        }

        // Automatically fetch online geocoded map results when typing 3+ letters
        if (debounceTimer) clearTimeout(debounceTimer);
        if (q.length >= 3 && willAutoFetch) {
          var delayMs = instantMatches.length === 0 ? 30 : 60;
          debounceTimer = setTimeout(function () {
            fetchGeocodeCached(q)
              .then(function (remoteData) {
                if (activeInput !== inputEl) return;

                var mergedList = [].concat(displayItems);

                if (Array.isArray(remoteData) && remoteData.length > 0) {
                  remoteData.forEach(function (remoteItem) {
                    if (!isResultRelevant(q, remoteItem.display_name)) return;
                    var exists = mergedList.some(function (m) {
                      return m.display_name.toLowerCase().trim() === remoteItem.display_name.toLowerCase().trim();
                    });
                    if (!exists) mergedList.push(remoteItem);
                  });
                }

                var sortedList = sortLocationsByPriority(mergedList, q);

                var hasExactAfterRemote = sortedList.some(function (item) {
                  return !item.isGps && (item.display_name || "").toLowerCase().split(',')[0].trim() === q.toLowerCase();
                });
                if (!hasExactAfterRemote && customOption) {
                  sortedList.push(customOption);
                }

                renderDropdown(sortedList);
              });
          }, delayMs);
        }
      });
    }

    function bindAllLocationInputs() {
      var inputs = document.querySelectorAll('#pickup, #drop, input[name="pickup"], input[name="drop"], input[name="hourlyPickup"]');
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        var key = inp.name || inp.id || "pickup";
        attachLocationPicker(inp, key);
      }
    }

    // Auto-init on page load & bind all fields
    if (document.readyState === "complete" || document.readyState === "interactive") {
      bindAllLocationInputs();
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        bindAllLocationInputs();
      });
    }

    document.addEventListener("focusin", function (e) {
      if (e.target && e.target.tagName === "INPUT") {
        var name = (e.target.name || "").toLowerCase();
        var id = (e.target.id || "").toLowerCase();
        if (name === "pickup" || name === "drop" || id === "pickup" || id === "drop" || name === "hourlypickup") {
          var key = e.target.name || e.target.id || "pickup";
          attachLocationPicker(e.target, key);
        }
      }
    });

    // Auto-check route memory and render share button when enabled in settings
    function checkAndRenderRouteShareButton() {
      if (!getUxConfig("enableShareRouteButton", false)) return;
      var pEl = document.getElementById("pickup") || document.querySelector('input[name="pickup"]');
      var dEl = document.getElementById("drop") || document.querySelector('input[name="drop"]');
      if (!pEl || !dEl) return;

      var pVal = (pEl.value || "").trim();
      var dVal = (dEl.value || "").trim();
      if (pVal.length < 2 || dVal.length < 2) return;

      fetch("/api/route-distance.php?pickup=" + encodeURIComponent(pVal) + "&drop=" + encodeURIComponent(dVal))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.success) {
            renderShareRouteButton(data);
          }
        })
        .catch(function () { });
    }

    function renderShareRouteButton(data) {
      var existingBtn = document.getElementById("dropcars-share-route-btn");
      if (existingBtn) existingBtn.remove();

      var form = document.getElementById("booking-form") || document.querySelector("form");
      if (!form) return;

      var slugP = data.pickup_slug || "pickup";
      var slugD = data.drop_slug || "drop";
      var fullShareUrl = window.location.origin + "/drop-cars/" + slugP + "-to-" + slugD;

      var container = document.createElement("div");
      container.id = "dropcars-share-route-btn";
      container.style.marginTop = "12px";
      container.style.padding = "10px 14px";
      container.style.background = "rgba(59, 130, 246, 0.08)";
      container.style.border = "1px solid rgba(59, 130, 246, 0.2)";
      container.style.borderRadius = "8px";
      container.style.display = "flex";
      container.style.alignItems = "center";
      container.style.justifyContent = "space-between";
      container.style.gap = "10px";

      var textHtml = '<div style="font-size:13px; color:#1e293b;"><i class="fa-solid fa-memory" style="color:#3b82f6; margin-right:6px;"></i> <strong>Route Cached:</strong> ~' + (data.distance_km || 0) + ' km (' + (data.duration_text || 'fixed fare') + ')</div>';
      var buttonHtml = '<button type="button" style="background:#3b82f6; color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px;"><i class="fa-solid fa-share-nodes"></i> Share Route</button>';

      container.innerHTML = textHtml + buttonHtml;

      var btn = container.querySelector("button");
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(fullShareUrl).then(function () {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Link Copied!';
            setTimeout(function () {
              btn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Share Route';
            }, 2500);
          });
        }
      });

      // Insert inside booking form before submit button
      var submitBtn = form.querySelector('button[type="submit"]') || form.lastElementChild;
      if (submitBtn) {
        form.insertBefore(container, submitBtn);
      } else {
        form.appendChild(container);
      }
    }

    var pEl = document.getElementById("pickup") || document.querySelector('input[name="pickup"]');
    var dEl = document.getElementById("drop") || document.querySelector('input[name="drop"]');
    if (pEl) {
      pEl.addEventListener("change", checkAndRenderRouteShareButton);
      pEl.addEventListener("blur", checkAndRenderRouteShareButton);
    }
    if (dEl) {
      dEl.addEventListener("change", checkAndRenderRouteShareButton);
      dEl.addEventListener("blur", checkAndRenderRouteShareButton);
    }

  } catch (globalErr) {
    // Fail-safe: Ensure any error inside the custom picker does not break the page
    console.warn("Location picker initialization note:", globalErr.message);
  }
})();
