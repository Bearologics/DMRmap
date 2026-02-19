package main

import (
	"database/sql"
	"log"

	"github.com/pressly/goose/v3"
)

func runMigrations(db *sql.DB, dir string) error {
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	if err := goose.Up(db, dir); err != nil {
		return err
	}
	log.Println("Database migrations applied successfully")
	return nil
}
