package services

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
)

// getSafeTitle ทำหน้าที่กรองเอาเฉพาะตัวอักษรและตัวเลข (Alphanumeric) 
// รองรับ Unicode เต็มรูปแบบ (เช่น ภาษาไทย ภาษาญี่ปุ่น ภาษาอังกฤษ) เหมือนคำสั่ง .isalnum() ของ Python
func getSafeTitle(title string) string {
	var sb strings.Builder
	for _, r := range title {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

// CheckAndDownloadYoutubeAudio ถอดตรรกะมาจาก Python ของคุณ 100%
// คืนค่า (isYoutubeVideo, outputAudioPath, error)
func CheckAndDownloadYoutubeAudio(urlStr string, ytCacheDir string) (bool, string, error) {
	// 1. ตรวจสอบ Regex ว่าเป็นลิงก์ YouTube หรือไม่ (ถอดมาจาก Python)
	youtubeRegex := `(?i)(https?://)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com|be)/(watch\?v=|embed/|v/|.+\?v=)?([^&=%\?]{11})`
	matched, err := regexp.MatchString(youtubeRegex, urlStr)
	if err != nil {
		return false, "", fmt.Errorf("regex error: %v", err)
	}
	if !matched {
		return false, "", nil // ไม่ใช่ลิงก์ YouTube
	}

	// สร้างโฟลเดอร์สำหรับเก็บ Cache หากยังไม่มี
	if err := os.MkdirAll(ytCacheDir, 0755); err != nil {
		return true, "", fmt.Errorf("failed to create cache dir: %v", err)
	}

	// 2. เรียก yt-dlp เพื่อดึง Title ของวิดีโอ (เทียบเท่า download=False ใน Python)
	fmt.Println("⏳ Fetching video info from YouTube...")
	cmdInfo := exec.Command("yt-dlp", "--print", "title", urlStr)
	var outInfo bytes.Buffer
	cmdInfo.Stdout = &outInfo
	if err := cmdInfo.Run(); err != nil {
		return true, "", fmt.Errorf("failed to get video title from yt-dlp: %v", err)
	}
	videoTitle := strings.TrimSpace(outInfo.String())

	// 3. แปลงชื่อวิดีโอให้ปลอดภัย (กรองเอาเฉพาะตัวอักษรและตัวเลข)
	safeTitle := getSafeTitle(videoTitle)

	// 4. ตรวจสอบความยาวของชื่อไฟล์ร่วมกับ Path ไม่ให้เกิน 255 ตัวอักษร (ตามเงื่อนไขของ Python)
	runes := []rune(safeTitle)
	maxTitleLen := 255 - len(ytCacheDir) - 5 // หักออก 5 เผื่อ "/" และ ".mp3"
	if maxTitleLen > 0 && len(runes) > maxTitleLen {
		safeTitle = string(runes[:maxTitleLen])
	}

	// กำหนด Path ไฟล์ปลายทางที่จะได้รับหลังแปลงเสร็จ
	outputFilepath := filepath.Join(ytCacheDir, safeTitle+".mp3")

	// 5. หากเคยดาวน์โหลดไว้แล้ว (มีไฟล์อยู่ใน Cache) ให้ส่ง Path กลับไปใช้งานได้ทันที ไม่ต้องโหลดซ้ำ
	if _, err := os.Stat(outputFilepath); err == nil {
		fmt.Printf("⏭️  Found cached audio: %s\n", outputFilepath)
		return true, outputFilepath, nil
	}

	// 6. เริ่มกระบวนการดาวน์โหลดและแตกไฟล์เสียงด้วย yt-dlp และ FFmpeg
	fmt.Printf("🚀 Downloading audio from YouTube: %s\n", videoTitle)
	
	// ตั้งค่า Template สำหรับชื่อไฟล์ชั่วคราวตอนดาวน์โหลด
	outputTemplate := filepath.Join(ytCacheDir, safeTitle+".%(ext)s")

	// คำสั่งทำข้อกำหนดเดิมใน Python: โหลดเสียงที่ดีที่สุด, ห้ามโหลดเพลย์ลิสต์, แตกเสียงเป็น mp3 320k
	cmdDownload := exec.Command("yt-dlp",
		"-f", "bestaudio/best",
		"--no-playlist",
		"-x",
		"--audio-format", "mp3",
		"--audio-quality", "320K",
		"-o", outputTemplate,
		urlStr,
	)

	// พ่น Log การดาวน์โหลดและ Progress bar ออกมาที่หน้าจอ Terminal ของ Go โดยตรง
	cmdDownload.Stdout = os.Stdout
	cmdDownload.Stderr = os.Stderr

	if err := cmdDownload.Run(); err != nil {
		return true, "", fmt.Errorf("yt-dlp download failed: %v", err)
	}

	fmt.Println("✅ YouTube download and audio extraction complete!")
	return true, outputFilepath, nil
}

