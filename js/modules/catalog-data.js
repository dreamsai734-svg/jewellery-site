(function () {
  function normalizeStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    if (value.includes("marked")) {
      return "marked";
    }
    return "unmarked";
  }

  function normalizeImageUrl(rawUrl) {
    const input = String(rawUrl || "").trim();
    if (!input) {
      return "";
    }

    try {
      const parsed = new URL(input, window.location.href);
      if (parsed.hostname.includes("drive.google.com")) {
        parsed.searchParams.delete("google_abuse");
      }
      if (parsed.hostname === "raw.githubusercontent.com") {
        parsed.pathname = parsed.pathname
          .split("/")
          .map(seg => {
            try {
              return encodeURIComponent(decodeURIComponent(seg).trim());
            } catch {
              return seg;
            }
          })
          .join("/");
      }
      return parsed.toString();
    } catch (err) {
      return encodeURI(input);
    }
  }

  function extractGoogleDriveId(url) {
    try {
      const parsed = new URL(url);
      const idFromQuery = parsed.searchParams.get("id");
      if (idFromQuery) {
        return idFromQuery;
      }

      const match = parsed.pathname.match(/\/d\/([A-Za-z0-9_-]+)/);
      return match ? match[1] : "";
    } catch (err) {
      return "";
    }
  }

  function buildImageSourceCandidates(item, preferCollageFirst) {
    const sources = preferCollageFirst
      ? [item["CollageURL"], item["DisplayURL"]]
      : [item["DisplayURL"], item["CollageURL"]];

    const out = [];
    const seen = new Set();

    const add = (url) => {
      const normalized = normalizeImageUrl(url);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      out.push(normalized);
    };

    sources.forEach((rawUrl) => {
      const normalized = normalizeImageUrl(rawUrl);
      if (!normalized) {
        return;
      }

      const driveId = extractGoogleDriveId(normalized);
      if (driveId) {
        add(`https://lh3.googleusercontent.com/d/${driveId}=w700`);
        add(`https://drive.google.com/thumbnail?id=${driveId}&sz=w700`);
        add(`https://drive.google.com/uc?export=view&id=${driveId}`);
      }

      add(normalized);
    });

    return out;
  }

  function getPreviewImageUrl(item) {
    const candidates = buildImageSourceCandidates(item, false);
    return candidates[0] || "";
  }

  function getPreviewFallbackImageUrl(item) {
    const candidates = buildImageSourceCandidates(item, false);
    return candidates[1] || "";
  }

  function rebuildDataIndex() {
    dataBySerial = new Map(data.map(item => [item["Serial No"], item]));
  }

  window.normalizeStatus = normalizeStatus;
  window.normalizeImageUrl = normalizeImageUrl;
  window.extractGoogleDriveId = extractGoogleDriveId;
  window.buildImageSourceCandidates = buildImageSourceCandidates;
  window.getPreviewImageUrl = getPreviewImageUrl;
  window.getPreviewFallbackImageUrl = getPreviewFallbackImageUrl;
  window.rebuildDataIndex = rebuildDataIndex;
})();
