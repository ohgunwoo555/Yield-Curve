CREATE TABLE "countries" (
	"code" text PRIMARY KEY NOT NULL,
	"name_ko" text NOT NULL,
	"currency" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"rows_upserted" integer DEFAULT 0,
	"from_date" date,
	"to_date" date,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "yields" (
	"country_code" text NOT NULL,
	"tenor" text NOT NULL,
	"date" date NOT NULL,
	"value" numeric(8, 4) NOT NULL,
	"source" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "yields_country_code_tenor_date_pk" PRIMARY KEY("country_code","tenor","date")
);
--> statement-breakpoint
ALTER TABLE "yields" ADD CONSTRAINT "yields_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "yields_country_date_idx" ON "yields" USING btree ("country_code","date" DESC NULLS LAST);