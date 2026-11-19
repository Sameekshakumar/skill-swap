-- ===========================================================================
-- Complete DDL for the Skill Swap database.
--
-- Generated from the live database, not written by hand:
--
--   pg_dump "<connection url>" --schema=public --schema-only \
--           --no-owner --no-acl --no-comments -f docs/schema.sql
--
-- Regenerate it after any migration, or it will quietly drift.
--
-- The authoritative source is still backend/prisma/schema.prisma plus the
-- migrations in backend/prisma/migrations/. This file exists so the whole
-- schema — types, tables, constraints, indexes, functions, the procedure and
-- the trigger — can be read in one place.
--
-- Contents
--   6  enum types        BookingParty, BookingStatus, Role, SkillLevel,
--                        TransactionType, UserStatus
--   7  tables            User, Skill, SkillModule, SkillToLearn, Booking,
--                        Transaction, Review
--                        (plus _prisma_migrations, which Prisma manages)
--   1  procedure         adjust_user_credits
--   3  functions         ledger_balance, refresh_user_rating, review_rating_sync
--   1  trigger           review_rating_sync_trigger on Review
--   15 indexes           including two HNSW pgvector indexes,
--                        Skill_embedding_idx and SkillModule_embedding_idx
--   11 foreign keys      with per-relationship ON DELETE rules
--
-- Note the delete rules on Booking: teacherId and learnerId have no ON DELETE
-- clause, so they default to RESTRICT. That is deliberate — deleting a
-- participant mid-session would strand the other side's history and credits.
-- Every other foreign key to "User" cascades.
--
-- Two vector columns, not one: Skill.embedding and SkillModule.embedding.
-- Folding a skill's module text into the skill's own vector was measured and
-- it diluted the skill, so each module is embedded and matched separately.
-- See backend/lib/embeddings.js and docs/06-vector-search.md.
-- ===========================================================================

--
-- PostgreSQL database dump
--

\restrict 8wqJnEFLWzveIkvf0ZY12w14ewvw6ututdSfQZQDYEQesgDMyhgqC330yJQMyFI

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: BookingParty; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BookingParty" AS ENUM (
    'learner',
    'teacher',
    'admin'
);


--
-- Name: BookingStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BookingStatus" AS ENUM (
    'Requested',
    'Confirmed',
    'Completed',
    'Cancelled'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'user',
    'admin'
);


--
-- Name: SkillLevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SkillLevel" AS ENUM (
    'Beginner',
    'Intermediate',
    'Advanced',
    'Expert'
);


--
-- Name: TransactionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TransactionType" AS ENUM (
    'Initial',
    'Lock',
    'Transfer',
    'Refund',
    'Adjustment'
);


--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserStatus" AS ENUM (
    'active',
    'suspended'
);


--
-- Name: adjust_user_credits(text, integer, text); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.adjust_user_credits(IN p_user_id text, IN p_amount integer, IN p_reason text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_rows INT;
BEGIN
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'Amount must not be zero';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  -- The balance check and the write are one statement. Reading the balance,
  -- deciding in application code, then writing it back would let two
  -- simultaneous deductions both pass the check.
  UPDATE "User"
  SET "creditBalance" = "creditBalance" + p_amount,
      "updatedAt"     = NOW()
  WHERE id = p_user_id
    AND (p_amount > 0 OR "creditBalance" >= -p_amount);

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Zero rows means one of two different problems; say which.
  IF v_rows = 0 THEN
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'User % not found', p_user_id;
    ELSE
      RAISE EXCEPTION 'Deducting % would take the balance below zero', -p_amount;
    END IF;
  END IF;

  INSERT INTO "Transaction" (id, "userId", "bookingId", type, amount, description, "updatedAt")
  VALUES (gen_random_uuid(), p_user_id, NULL, 'Adjustment', p_amount, btrim(p_reason), NOW());
END;
$$;


--
-- Name: ledger_balance(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ledger_balance(p_user_id text) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT 10 + COALESCE(SUM(amount), 0)::INT
  FROM "Transaction"
  WHERE "userId" = p_user_id;
$$;


--
-- Name: refresh_user_rating(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_user_rating(target_id text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE "User" u
  SET
    -- No reviews left means no rating, not NULL: the column is NOT NULL and
    -- the UI reads 0 as "not rated yet".
    rating = COALESCE(
      (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM "Review" r WHERE r."revieweeId" = target_id),
      0
    ),
    "reviewCount" = (SELECT COUNT(*) FROM "Review" r WHERE r."revieweeId" = target_id)
  WHERE u.id = target_id;
END;
$$;


--
-- Name: review_rating_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_rating_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- DELETE has no NEW, INSERT has no OLD.
  IF TG_OP <> 'INSERT' THEN
    PERFORM refresh_user_rating(OLD."revieweeId");
  END IF;

  -- On an UPDATE that moved the review to a different person, both the old
  -- and the new reviewee need recomputing.
  IF TG_OP <> 'DELETE' THEN
    PERFORM refresh_user_rating(NEW."revieweeId");
  END IF;

  RETURN NULL; -- AFTER trigger: the return value is ignored.
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Booking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Booking" (
    id text NOT NULL,
    skill text NOT NULL,
    status public."BookingStatus" DEFAULT 'Requested'::public."BookingStatus" NOT NULL,
    "creditAmount" integer NOT NULL,
    "dateTime" timestamp(3) without time zone NOT NULL,
    duration integer DEFAULT 1 NOT NULL,
    "completedByLearner" boolean DEFAULT false NOT NULL,
    "completedByTeacher" boolean DEFAULT false NOT NULL,
    "cancelledBy" public."BookingParty",
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "teacherId" text NOT NULL,
    "learnerId" text NOT NULL,
    "skillId" text
);


--
-- Name: Review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Review" (
    id text NOT NULL,
    rating integer NOT NULL,
    comment text,
    skill text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "reviewerId" text NOT NULL,
    "revieweeId" text NOT NULL,
    "bookingId" text NOT NULL
);


--
-- Name: Skill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Skill" (
    id text NOT NULL,
    "skillName" text NOT NULL,
    level public."SkillLevel" NOT NULL,
    "creditsPerHour" integer DEFAULT 1 NOT NULL,
    description text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "userId" text NOT NULL,
    embedding public.vector(384)
);


--
-- Name: SkillModule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SkillModule" (
    id text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "skillId" text NOT NULL,
    embedding public.vector(384)
);


--
-- Name: SkillToLearn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SkillToLearn" (
    id text NOT NULL,
    "skillName" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userId" text NOT NULL
);


--
-- Name: Transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Transaction" (
    id text NOT NULL,
    type public."TransactionType" NOT NULL,
    amount integer NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "userId" text NOT NULL,
    "bookingId" text
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    college text,
    "yearOfStudy" text,
    bio text,
    "creditBalance" integer DEFAULT 10 NOT NULL,
    rating double precision DEFAULT 0 NOT NULL,
    "reviewCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "avatarUrl" text,
    "passwordHash" text,
    role public."Role" DEFAULT 'user'::public."Role" NOT NULL,
    status public."UserStatus" DEFAULT 'active'::public."UserStatus" NOT NULL
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: Booking Booking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_pkey" PRIMARY KEY (id);


--
-- Name: Review Review_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Review"
    ADD CONSTRAINT "Review_pkey" PRIMARY KEY (id);


--
-- Name: SkillModule SkillModule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SkillModule"
    ADD CONSTRAINT "SkillModule_pkey" PRIMARY KEY (id);


--
-- Name: SkillToLearn SkillToLearn_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SkillToLearn"
    ADD CONSTRAINT "SkillToLearn_pkey" PRIMARY KEY (id);


--
-- Name: Skill Skill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Skill"
    ADD CONSTRAINT "Skill_pkey" PRIMARY KEY (id);


--
-- Name: Transaction Transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Booking_learnerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Booking_learnerId_idx" ON public."Booking" USING btree ("learnerId");


--
-- Name: Booking_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Booking_status_idx" ON public."Booking" USING btree (status);


--
-- Name: Booking_teacherId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Booking_teacherId_idx" ON public."Booking" USING btree ("teacherId");


--
-- Name: Review_bookingId_reviewerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Review_bookingId_reviewerId_key" ON public."Review" USING btree ("bookingId", "reviewerId");


--
-- Name: Review_revieweeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Review_revieweeId_idx" ON public."Review" USING btree ("revieweeId");


--
-- Name: SkillModule_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SkillModule_embedding_idx" ON public."SkillModule" USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: SkillModule_skillId_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SkillModule_skillId_position_idx" ON public."SkillModule" USING btree ("skillId", "position");


--
-- Name: SkillToLearn_skillName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SkillToLearn_skillName_idx" ON public."SkillToLearn" USING btree ("skillName");


--
-- Name: SkillToLearn_userId_skillName_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SkillToLearn_userId_skillName_key" ON public."SkillToLearn" USING btree ("userId", "skillName");


--
-- Name: Skill_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Skill_embedding_idx" ON public."Skill" USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: Skill_skillName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Skill_skillName_idx" ON public."Skill" USING btree ("skillName");


--
-- Name: Skill_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Skill_userId_idx" ON public."Skill" USING btree ("userId");


--
-- Name: Transaction_bookingId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transaction_bookingId_idx" ON public."Transaction" USING btree ("bookingId");


--
-- Name: Transaction_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transaction_userId_idx" ON public."Transaction" USING btree ("userId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: Review review_rating_sync_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER review_rating_sync_trigger AFTER INSERT OR DELETE OR UPDATE ON public."Review" FOR EACH ROW EXECUTE FUNCTION public.review_rating_sync();


--
-- Name: Booking Booking_learnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Booking Booking_skillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES public."Skill"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Booking Booking_teacherId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Review Review_bookingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Review"
    ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES public."Booking"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Review Review_revieweeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Review"
    ADD CONSTRAINT "Review_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Review Review_reviewerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Review"
    ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SkillModule SkillModule_skillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SkillModule"
    ADD CONSTRAINT "SkillModule_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES public."Skill"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SkillToLearn SkillToLearn_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SkillToLearn"
    ADD CONSTRAINT "SkillToLearn_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Skill Skill_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Skill"
    ADD CONSTRAINT "Skill_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Transaction Transaction_bookingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES public."Booking"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Transaction Transaction_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 8wqJnEFLWzveIkvf0ZY12w14ewvw6ututdSfQZQDYEQesgDMyhgqC330yJQMyFI

