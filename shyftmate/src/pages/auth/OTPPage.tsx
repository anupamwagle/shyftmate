import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2, Zap, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { getApiError } from '@/lib/api'

const OTP_LENGTH = 6
const OTP_EXPIRY_SECONDS = 600 // 10 minutes
const RESEND_COOLDOWN_SECONDS = 60

export default function OTPPage() {
  const navigate = useNavigate()
  const { verifyOtp, resendOtp, isOtpPending } = useAuth()
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [timeLeft, setTimeLeft] = useState(OTP_EXPIRY_SECONDS)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Redirect if not in OTP flow
  useEffect(() => {
    if (!isOtpPending) {
      navigate('/login')
    }
  }, [isOtpPending, navigate])

  // Expiry countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval)
          toast.error('OTP has expired. Please request a new code.')
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const interval = setInterval(() => {
      setResendCooldown((c) => (c <= 1 ? 0 : c - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [resendCooldown])

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const handleChange = useCallback(
    (idx: number, value: string) => {
      // Handle paste
      if (value.length > 1) {
        const pasted = value.replace(/\D/g, '').slice(0, OTP_LENGTH)
        const next = Array(OTP_LENGTH).fill('')
        pasted.split('').forEach((ch, i) => {
          next[i] = ch
        })
        setDigits(next)
        const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1)
        inputRefs.current[focusIdx]?.focus()
        return
      }

      const ch = value.replace(/\D/g, '')
      const next = [...digits]
      next[idx] = ch
      setDigits(next)
      if (ch && idx < OTP_LENGTH - 1) {
        inputRefs.current[idx + 1]?.focus()
      }
    },
    [digits]
  )

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits]
        next[idx] = ''
        setDigits(next)
      } else if (idx > 0) {
        inputRefs.current[idx - 1]?.focus()
        const next = [...digits]
        next[idx - 1] = ''
        setDigits(next)
      }
    }
  }

  async function handleVerify() {
    const code = digits.join('')
    if (code.length < OTP_LENGTH) {
      toast.error('Please enter the full 6-digit code')
      return
    }
    setIsVerifying(true)
    try {
      await verifyOtp(code)
      navigate('/dashboard')
    } catch (error) {
      toast.error(getApiError(error) || 'Invalid code. Please try again.')
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleResend() {
    setIsResending(true)
    try {
      await resendOtp()
      toast.success('A new code has been sent to your email')
      setTimeLeft(OTP_EXPIRY_SECONDS)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } catch (error) {
      toast.error(getApiError(error) || 'Failed to resend code')
    } finally {
      setIsResending(false)
    }
  }

  // Auto-submit when all digits filled
  useEffect(() => {
    if (digits.every((d) => d !== '') && digits.join('').length === OTP_LENGTH) {
      handleVerify()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-primary-600">Gator</h1>
          <p className="text-neutral-500 text-sm mt-1">Shyftmate Workforce Platform</p>
        </div>

        <Card className="shadow-md">
          <CardHeader className="pb-4 text-center">
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-primary-600" />
              </div>
            </div>
            <CardTitle className="text-xl">Verify your identity</CardTitle>
            <CardDescription>
              We sent a 6-digit code to your email. Enter it below to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Digit inputs */}
            <div className="flex gap-2 justify-center">
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={(e) => {
                    e.preventDefault()
                    const pasted = e.clipboardData.getData('text')
                    handleChange(idx, pasted)
                  }}
                  className="w-11 h-14 text-center text-xl font-semibold rounded-lg border-2 border-neutral-200 focus:border-primary-600 focus:outline-none transition-colors bg-white"
                  autoFocus={idx === 0}
                />
              ))}
            </div>

            {/* Timer */}
            <div className="text-center">
              {timeLeft > 0 ? (
                <p className="text-sm text-neutral-500">
                  Code expires in{' '}
                  <span className={timeLeft < 60 ? 'text-red-500 font-medium' : 'font-medium'}>
                    {formatTime(timeLeft)}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-red-500 font-medium">Code has expired</p>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleVerify}
              disabled={isVerifying || digits.join('').length < OTP_LENGTH}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </Button>

            <div className="text-center">
              <p className="text-sm text-neutral-500">
                Didn&apos;t receive a code?{' '}
                <button
                  onClick={handleResend}
                  disabled={isResending || resendCooldown > 0}
                  className="text-primary-600 font-medium hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {isResending
                    ? 'Sending...'
                    : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : 'Resend code'}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
