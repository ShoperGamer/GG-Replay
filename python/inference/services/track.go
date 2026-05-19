package services

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// TrackInfo โครงสร้างสำหรับเก็บข้อมูลของไฟล์เสียงที่ประมวลผลแล้ว
type TrackInfo struct {
	MD5          string
	TrackName    string
	OriginalPath string
}

// ProcessTrackAndGetHash ถอดตรรกะมาจากเมธอด set_track_values ใน Python
// โดยเปลี่ยนมาใช้วิธี Reader/Writer (Streaming) เพื่อควบคุมการกิน RAM ให้ต่ำที่สุด
func ProcessTrackAndGetHash(sourceAudioPath string, outputDirectory string) (*TrackInfo, error) {
	// 1. ดึงชื่อแทร็กออกมาโดยไม่มีนามสกุลไฟล์ (เทียบเท่า os.path.splitext(os.path.basename(...))[0])
	baseName := filepath.Base(sourceAudioPath)
	ext := filepath.Ext(sourceAudioPath)
	trackName := strings.TrimSuffix(baseName, ext)

	// 2. เปิดไฟล์ต้นฉบับจากดิสก์เพื่อเตรียมอ่านค่า (เปิดเป็น Stream ค้างไว้ ไม่โหลดเข้า RAM)
	srcFile, err := os.Open(sourceAudioPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open source file: %v", err)
	}
	defer srcFile.Close()

	// 3. เริ่มคำนวณ MD5 Hash แบบ Streaming (แอบอ่านข้อมูลทีละบล็อกส่งไปให้ตัวคำนวณ)
	hasher := md5.New()
	if _, err := io.Copy(hasher, srcFile); err != nil {
		return nil, fmt.Errorf("failed to calculate md5 hash: %v", err)
	}
	trackMD5 := hex.EncodeToString(hasher.Sum(nil))

	// 4. เตรียมสร้างโฟลเดอร์ปลายทางสำหรับเก็บไฟล์ต้นฉบับ (originals)
	originalsDir := filepath.Join(outputDirectory, "originals")
	if err := os.MkdirAll(originalsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create originals directory: %v", err)
	}

	// 5. กำหนดชื่อไฟล์และ Path ใหม่ในโฟลเดอร์ originals โดยใช้ค่า MD5 เป็นชื่อไฟล์
	originalsFile := filepath.Join(originalsDir, trackMD5+ext)

	// 6. ตรวจสอบว่าเคยมีไฟล์นี้คัดลอกไว้ในระบบแล้วหรือยัง (ช่วลดการทำงานซ้ำซ้อน)
	if _, err := os.Stat(originalsFile); os.IsNotExist(err) {
		// รีเซ็ต Pointer การอ่านของไฟล์ต้นฉบับกลับไปที่จุดเริ่มต้น (เนื่องจากโดนดึงไปหา MD5 จนสุดแล้ว)
		if _, err := srcFile.Seek(0, 0); err != nil {
			return nil, fmt.Errorf("failed to seek source file: %v", err)
		}

		// สร้างไฟล์ใหม่ที่ปลายทาง
		destFile, err := os.Create(originalsFile)
		if err != nil {
			return nil, fmt.Errorf("failed to create destination file: %v", err)
		}
		defer destFile.Close()

		// คัดลอกข้อมูลจากไฟล์ต้นฉบับไปไฟล์ปลายทางแบบ Streaming (RAM ไม่บวม)
		if _, err := io.Copy(destFile, srcFile); err != nil {
			return nil, fmt.Errorf("failed to copy file to originals: %v", err)
		}
		fmt.Printf("💾 Successfully copied new track to originals: %s\n", originalsFile)
	} else {
		fmt.Printf("แทร็กนี้เคยถูกประมวลผลและมีไฟล์อยู่แล้ว: %s\n", originalsFile)
	}

	// ส่งผลลัพธ์ข้อมูลกลับไปใช้งานต่อ
	return &TrackInfo{
		MD5:          trackMD5,
		TrackName:    trackName,
		OriginalPath: originalsFile,
	}, nil
}

