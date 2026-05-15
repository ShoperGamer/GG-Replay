package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

type RvcModel struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

// WriteCounter ใช้สำหรับนับจำนวน Byte ที่โหลดแล้วเพื่อทำ Progress Bar
type WriteCounter struct {
	Total uint64
	Name  string
}

func (wc *WriteCounter) Write(p []byte) (int, error) {
	n := len(p)
	wc.Total += uint64(n)
	fmt.Printf("\rDownloading %s... %v MB complete", wc.Name, wc.Total/1024/1024)
	return n, nil
}

// getSafeName ทำความสะอาดชื่อไฟล์ให้เหลือแค่ a-z, A-Z และ 0-9 เท่านั้น
func getSafeName(title string) string {
	reg := regexp.MustCompile("[^a-zA-Z0-9]+")
	return reg.ReplaceAllString(title, "")
}

// downloadDirect ใช้ดาวน์โหลดไฟล์จาก Direct Link ทั่วไปผ่าน HTTP ปกติ
func downloadDirect(urlStr string, dest string, name string) error {
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	resp, err := http.Get(urlStr)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	counter := &WriteCounter{Name: name}
	_, err = io.Copy(out, io.TeeReader(resp.Body, counter))
	fmt.Print("\n") // ขึ้นบรรทัดใหม่เมื่อโหลดไฟล์นี้เสร็จ
	return err
}

// downloadFile เช็คประเภทของลิงก์และเลือกวิธีดาวน์โหลดที่เหมาะสม
func downloadFile(fileUrl string, dest string, name string) error {
	parsedUrl, err := url.Parse(fileUrl)
	if err != nil {
		return downloadDirect(fileUrl, dest, name) // ถ้า Parse ไม่ผ่านให้ลองโหลดตรง
	}

	host := strings.ToLower(parsedUrl.Host)

	// --- 1. กรณีเป็น Google Drive ---
	if strings.Contains(host, "drive.google.com") {
		fmt.Printf("\n[Google Drive] Downloading %s via gdown...\n", name)
		// ต้องติดตั้ง gdown ในเครื่องก่อน (pip install gdown)
		cmd := exec.Command("gdown", fileUrl, "-O", dest)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}

	// --- 2. กรณีเป็น Mega.nz ---
	if strings.Contains(host, "mega.nz") {
		fmt.Printf("\n[Mega.nz] Downloading %s via mega-get...\n", name)
		// แนะนำให้ติดตั้ง Megatools ในระบบ (หรือเปลี่ยนไปใช้ library Go ถ้าไม่อยากเรียก Command)
		cmd := exec.Command("mega-get", fileUrl, "--path", dest)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}

	// --- 3. กรณีเป็น Direct Link ---
	fmt.Printf("\n[Direct HTTP] Downloading %s...\n", name)
	return downloadDirect(fileUrl, dest, name)
}

func main() {
	fmt.Println("🚀 Starting Asset Downloader (Golang Concurrent Mode)")

	// 1. อ่านไฟล์ JSON จากโฟลเดอร์ scripts
	jsonPath := "../../scripts/rvc-models-to-parse.json"
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		fmt.Printf("❌ Error reading JSON: %v\n", err)
		return
	}

	var models []RvcModel
	err = json.Unmarshal(data, &models)
	if err != nil {
		fmt.Printf("❌ Error parsing JSON: %v\n", err)
		return
	}

	// 2. สร้างโฟลเดอร์รองรับ
	modelsDir := "../../data/models"
	os.MkdirAll(modelsDir, 0755)

	var wg sync.WaitGroup
	// จำกัดจำนวนดาวน์โหลดขนานกันที่ 3 ไฟล์ (กันเซิร์ฟเวอร์แบน/เน็ตค้าง)
	concurrencyLimit := make(chan struct{}, 3)

	for _, m := range models {
		if m.URL == "" {
			continue
		}

		wg.Add(1)
		go func(model RvcModel) {
			defer wg.Done()
			concurrencyLimit <- struct{}{}        // จองคิวรัน
			defer func() { <-concurrencyLimit }() // คืนคิวเมื่อทำงานเสร็จ

			// สร้างชื่อไฟล์ที่ปลอดภัยและไม่มีอักขระพิเศษ
			safeName := getSafeName(model.Title)
			dest := filepath.Join(modelsDir, safeName+".zip")

			// ข้ามถ้าไฟล์มีอยู่แล้ว
			if _, err := os.Stat(dest); err == nil {
				fmt.Printf("\n⏭️  Skipping %s (Already exists)\n", safeName)
				return
			}

			// เริ่มดาวน์โหลด
			err := downloadFile(model.URL, dest, safeName)
			if err != nil {
				fmt.Printf("\n❌ Error downloading %s: %v\n", safeName, err)
			} else {
				fmt.Printf("✅ Finished %s\n", safeName)
			}
		}(m)
	}

	// รอให้ทุก Thread ทำงานเสร็จ
	wg.Wait()
	fmt.Println("\n🎉 All downloads finished successfully!")
}