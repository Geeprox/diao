import AppKit
import Foundation

let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

let tile = "#183C34"
let ink = "#F8F5E8"
let accent = "#A9E5C6"
let centerline = CGMutablePath()
centerline.move(to: CGPoint(x: 6.6, y: 8.1))
centerline.addLine(to: CGPoint(x: 13.4, y: 8.1))
centerline.addCurve(to: CGPoint(x: 13.4, y: 15.9),
                    control1: CGPoint(x: 19.1, y: 8.1),
                    control2: CGPoint(x: 19.1, y: 15.9))
centerline.addLine(to: CGPoint(x: 11.1, y: 15.9))

func color(_ hex: String) -> CGColor {
    let value = UInt32(hex.dropFirst(), radix: 16)!
    return NSColor(srgbRed: CGFloat((value >> 16) & 255) / 255,
                   green: CGFloat((value >> 8) & 255) / 255,
                   blue: CGFloat(value & 255) / 255, alpha: 1).cgColor
}

let mark = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="6.2" fill="\(tile)"/>
  <path d="M6.6 8.1H13.4C19.1 8.1 19.1 15.9 13.4 15.9H11.1" fill="none" stroke="\(ink)" stroke-width="2.65" stroke-linecap="round"/>
  <circle cx="6.7" cy="15.9" r="1.55" fill="\(accent)"/>
</svg>
"""
try mark.write(to: output.appendingPathComponent("mark.svg"), atomically: true, encoding: .utf8)

for size in [16, 32, 48, 128] {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    let graphics = context.cgContext
    let canvas = CGFloat(size)
    let padding: CGFloat = size == 128 ? 16 : 0
    let scale = (canvas - 2 * padding) / 24
    graphics.clear(CGRect(x: 0, y: 0, width: canvas, height: canvas))
    graphics.translateBy(x: padding, y: canvas - padding)
    graphics.scaleBy(x: scale, y: -scale)
    graphics.setFillColor(color(tile))
    graphics.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: 24, height: 24),
                            cornerWidth: 6.2, cornerHeight: 6.2, transform: nil))
    graphics.fillPath()
    graphics.setStrokeColor(color(ink))
    graphics.setLineWidth(2.65)
    graphics.setLineCap(.round)
    graphics.addPath(centerline)
    graphics.strokePath()
    graphics.setFillColor(color(accent))
    graphics.fillEllipse(in: CGRect(x: 5.15, y: 14.35, width: 3.1, height: 3.1))
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!
        .write(to: output.appendingPathComponent("icon-\(size).png"), options: .atomic)
}
