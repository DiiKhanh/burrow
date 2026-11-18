package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework AppKit
#import <AppKit/AppKit.h>
#include <stdlib.h>

// MyGo displays tray images at 18 points high. Draw at Retina resolution
// with the same system font and tabular digits used by the Status panel.
static void *statusImage(const char *label, const char *value, int dark, int *length) {
 @autoreleasepool {
  NSString *name = @(label);
  NSArray<NSString *> *lines = [@(value) componentsSeparatedByString:@"\n"];
  NSColor *accent = [name isEqual:@"CPU"] ? NSColor.systemTealColor :
                    [name isEqual:@"RAM"] ? NSColor.systemYellowColor :
                    [name isEqual:@"NET"] ? NSColor.systemBlueColor : NSColor.systemOrangeColor;
  NSDictionary *badge = @{NSFontAttributeName:[NSFont boldSystemFontOfSize:17], NSForegroundColorAttributeName:NSColor.blackColor};
  NSDictionary *number = @{NSFontAttributeName:[NSFont monospacedDigitSystemFontOfSize:lines.count>1?17:23 weight:NSFontWeightMedium],
                           NSForegroundColorAttributeName:dark?NSColor.whiteColor:NSColor.blackColor};
  CGFloat left = ceil([name sizeWithAttributes:badge].width)+10;
  CGFloat width = 0;
  for (NSString *line in lines) width = MAX(width,[line sizeWithAttributes:number].width);
  NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:(NSInteger)ceil(left+width+5) pixelsHigh:36 bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
  [NSGraphicsContext saveGraphicsState];
  NSGraphicsContext.currentContext=[NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
  [accent setFill];
  [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(0,5,left-2,26) xRadius:5 yRadius:5] fill];
  [name drawAtPoint:NSMakePoint(4,7) withAttributes:badge];
  for(NSUInteger i=0;i<lines.count;i++){
   CGFloat y=lines.count>1?(i==0?16:-2):3;
   [lines[i] drawAtPoint:NSMakePoint(left+3,y) withAttributes:number];
  }
  [NSGraphicsContext restoreGraphicsState];
  NSData *png=[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
  *length=(int)png.length;
  return png.length ? memcpy(malloc(png.length),png.bytes,png.length) : NULL;
 }
}
*/
import "C"
import "unsafe"

func menuImage(label, value string, dark bool) []byte {
	name := C.CString(label)
	defer C.free(unsafe.Pointer(name))
	text := C.CString(value)
	defer C.free(unsafe.Pointer(text))
	var appearance C.int
	if dark {
		appearance = 1
	}
	var size C.int
	image := C.statusImage(name, text, appearance, &size)
	defer C.free(image)
	return C.GoBytes(image, size)
}
