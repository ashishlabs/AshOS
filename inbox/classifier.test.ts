import { describe, expect, it } from "vitest";
import { classify } from "./classifier";

describe("classify", () => {
  it("classifies plain text with no URL as text", () => {
    expect(classify("remember to write the quarterly review")).toEqual({ sourceType: "text", tags: [] });
  });

  it("classifies a GitHub repo URL", () => {
    const result = classify("https://github.com/anthropics/claude-code");
    expect(result.sourceType).toBe("github-repo");
    expect(result.tags).toContain("github");
    expect(result.detectedUrl).toBe("https://github.com/anthropics/claude-code");
  });

  it("classifies a YouTube URL", () => {
    expect(classify("https://www.youtube.com/watch?v=abc123").sourceType).toBe("youtube");
    expect(classify("https://youtu.be/abc123").sourceType).toBe("youtube");
  });

  it("classifies a tweet/X status URL", () => {
    expect(classify("https://x.com/someone/status/123456").sourceType).toBe("tweet");
    expect(classify("https://twitter.com/someone/status/123456").sourceType).toBe("tweet");
  });

  it("classifies a PDF URL", () => {
    expect(classify("https://example.com/paper.pdf").sourceType).toBe("pdf");
  });

  it("classifies an image URL", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "bmp", "webp"]) {
      const result = classify(`https://example.com/screenshot.${ext}`);
      expect(result.sourceType).toBe("image");
      expect(result.tags).toContain("image");
    }
  });

  it("falls back to article for any other URL", () => {
    const result = classify("https://example.com/blog/some-post");
    expect(result.sourceType).toBe("article");
    expect(result.tags).toContain("link");
  });

  it("classifies text containing an embedded URL by the URL, not plain text", () => {
    const result = classify("check this out: https://github.com/anthropics/claude-code it's great");
    expect(result.sourceType).toBe("github-repo");
  });
});
