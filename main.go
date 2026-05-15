package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// สร้าง Instance ของ App จากไฟล์ app.go
	app := NewApp()

	// ตั้งค่าและรัน Wails
	err := wails.Run(&options.App{
		Title:  "Replay AI Voice",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// แก้ไขจาก BackgroundUint เป็น BackgroundColour
		BackgroundColour: &options.RGBA{R: 15, G: 23, B: 42, A: 1}, 
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}